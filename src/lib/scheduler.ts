// =====================================================================
// scheduler — node-cron registry for per-session agent triggers.
//
// Triggers live in `sessions.config.triggers[]`. On server boot we walk
// every session and register its enabled triggers. Endpoints in
// /api/sessions/:id/triggers mutate the registry alongside the DB.
//
// When a trigger fires:
//   1. Synthesize a virtual `share`-typed ingest (raw_text = trigger
//      prompt; metadata.source_app = 'trigger', metadata.trigger_id).
//   2. Build the kickoff prompt the same way /api/run does.
//   3. Drain `streamSession()` server-side, no SSE consumer.
//   4. Persist the resulting Artifact, update ingest status, update
//      the trigger's `last_fired_at`.
//
// Multiple in-flight fires per session are allowed but will likely
// cause context confusion; for now we trust the user to schedule
// sanely.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import cron, { type ScheduledTask } from 'node-cron'
import type { Database as DB } from 'better-sqlite3'

import type {
  Session,
  SessionConfig,
  Trigger,
} from '../../shared/index.js'
import { rowToSession } from '../db.js'
import { newId } from './id.js'
import { buildPrompt } from '../orchestrator/buildPrompt.js'
import { streamSession } from '../orchestrator/streamSession.js'
import { parseArtifact } from '../orchestrator/parseArtifact.js'
import { persistArtifact } from '../orchestrator/persistArtifact.js'
import { rowToIngest } from '../db.js'
import { enqueueRun } from './runQueue.js'
import { publish } from './eventBus.js'
import * as log from './log.js'

interface AgentRef {
  agent_id: string
  environment_id: string
}

interface SchedulerDeps {
  db: DB
  client: Anthropic
  /** Returns the current bootstrapped agent IDs, or null if missing. */
  getAgent: () => AgentRef | null
}

/** Composite key — same trigger id can technically exist under two
 *  sessions if uniqueness ever drifts; we pair the parent session id
 *  with the trigger id to keep the registry safe. */
const taskKey = (sessionId: string, triggerId: string): string =>
  `${sessionId}::${triggerId}`

const tasks = new Map<string, ScheduledTask>()

let depsRef: SchedulerDeps | null = null

export function initScheduler(deps: SchedulerDeps): void {
  depsRef = deps
  const sessions = (
    deps.db.prepare('SELECT * FROM sessions').all() as Parameters<
      typeof rowToSession
    >[0][]
  ).map(rowToSession)

  for (const s of sessions) {
    for (const t of s.config.triggers ?? []) {
      registerTrigger(s.id, t)
    }
  }
  if (tasks.size > 0) {
    log.info(`scheduler · ${tasks.size} trigger(s) registered`)
  }
}

export function registerTrigger(sessionId: string, trigger: Trigger): boolean {
  if (trigger.enabled === false) return false
  if (!cron.validate(trigger.schedule)) {
    log.warn(`scheduler · invalid cron "${trigger.schedule}" — skipping`)
    return false
  }
  const key = taskKey(sessionId, trigger.id)
  // Replace any existing task with the same key.
  unregisterTrigger(sessionId, trigger.id)

  const task = cron.schedule(
    trigger.schedule,
    async () => {
      try {
        await fireTrigger(sessionId, trigger.id)
      } catch (err) {
        log.fail(
          `scheduler · trigger fire failed (${err instanceof Error ? err.message : String(err)})`,
        )
      }
    },
    { timezone: 'UTC' },
  )
  tasks.set(key, task)
  return true
}

export function unregisterTrigger(
  sessionId: string,
  triggerId: string,
): boolean {
  const key = taskKey(sessionId, triggerId)
  const task = tasks.get(key)
  if (!task) return false
  task.stop()
  tasks.delete(key)
  return true
}

export function unregisterAllForSession(sessionId: string): void {
  for (const key of [...tasks.keys()]) {
    if (key.startsWith(`${sessionId}::`)) {
      tasks.get(key)?.stop()
      tasks.delete(key)
    }
  }
}

export function listRegistered(): Array<{
  session_id: string
  trigger_id: string
}> {
  return [...tasks.keys()].map((k) => {
    const [session_id, trigger_id] = k.split('::')
    return { session_id, trigger_id }
  })
}

// ─── Fire pipeline ──────────────────────────────────────────────────

async function fireTrigger(sessionId: string, triggerId: string): Promise<void> {
  if (!depsRef) return
  const { db, client, getAgent } = depsRef
  const agent = getAgent()
  if (!agent) {
    log.warn('scheduler · no agent provisioned, skipping trigger fire')
    return
  }

  const sessionRow = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as Parameters<typeof rowToSession>[0] | undefined
  if (!sessionRow) {
    unregisterAllForSession(sessionId)
    return
  }
  const session = rowToSession(sessionRow)
  const trigger = session.config.triggers?.find((t) => t.id === triggerId)
  if (!trigger || trigger.enabled === false) {
    unregisterTrigger(sessionId, triggerId)
    return
  }

  log.status(
    `scheduler · firing "${trigger.description || trigger.schedule}" on ${session.name}`,
  )

  // ── Synthesize a virtual ingest ─────────────────────────────────
  const ingestId = newId('ing')
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO ingests (id, session_id, type, file_url, raw_text, metadata, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ingestId,
    session.id,
    'share',
    null,
    trigger.prompt,
    JSON.stringify({
      timestamp: now,
      source_app: 'trigger',
      trigger_id: trigger.id,
    }),
    'processing',
    now,
  )

  const ingestRow = db
    .prepare('SELECT * FROM ingests WHERE id = ?')
    .get(ingestId) as Parameters<typeof rowToIngest>[0]
  const ingest = rowToIngest(ingestRow)

  // ── Route the run through the shared per-session queue so we
  //     never collide with user ingests, reflexes, or live updates.
  await enqueueRun({
    sessionId: session.id,
    priority: 'trigger',
    description: `Trigger: ${trigger.description || trigger.schedule}`,
    run: async () => {
      // Re-read the session NOW. The cron-fire snapshot is from when
      // we entered fireTrigger, but the queue may have made us wait
      // behind another run that updated managed_session_id. Using the
      // stale value would fork the agent into a new managed session
      // and drop the thread.
      const freshRow = db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(session.id) as
        | Parameters<typeof rowToSession>[0]
        | undefined
      if (!freshRow) return
      const fresh = rowToSession(freshRow)

      const prompt = buildPrompt({ session: fresh, ingest, db })

      const generator = streamSession({
        client,
        agentId: agent.agent_id,
        environmentId: agent.environment_id,
        localSessionId: fresh.id,
        ingestId: ingest.id,
        promptText: prompt.text,
        fileIds: prompt.fileIds,
        title: `[trigger] ${trigger.description || fresh.name}`,
        existingManagedSessionId: fresh.managed_session_id ?? undefined,
      })

      let agentText = ''
      let result = await generator.next()
      while (!result.done) {
        const evt = result.value
        if (evt.type === 'agent.text_delta') agentText += evt.text
        publish({
          type: 'run',
          event: evt,
          session_id: session.id,
          priority: 'trigger',
        })
        result = await generator.next()
      }
      const final = result.value

      if (final.exitReason === 'end_turn' && final.draft) {
        const artifact = persistArtifact({
          db,
          sessionId: session.id,
          draft: final.draft,
        })
        db.prepare('UPDATE ingests SET status = ? WHERE id = ?').run(
          'processed',
          ingest.id,
        )
        publish({
          type: 'run',
          event: { type: 'artifact.ready', artifact },
          session_id: session.id,
          priority: 'trigger',
        })
        log.ok(`scheduler · artifact ${artifact.id} persisted`)
      } else if (final.exitReason === 'parse_error') {
        const parsed = parseArtifact(agentText)
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run(
          'failed',
          parsed.ok
            ? 'unexpected: parse succeeded on retry'
            : final.errorMessage ?? 'parse error',
          ingest.id,
        )
        log.warn(`scheduler · parse failed: ${final.errorMessage}`)
      } else {
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run('failed', final.errorMessage ?? final.exitReason, ingest.id)
        log.warn(`scheduler · run ${final.exitReason}`)
      }

      if (final.managedSessionId) {
        db.prepare(
          'UPDATE sessions SET managed_session_id = ?, run_status = ? WHERE id = ?',
        ).run(
          final.managedSessionId,
          final.exitReason === 'end_turn' ? 'idle' : final.exitReason,
          session.id,
        )
      }

      // Re-read the session row (post-run), mutate the trigger, write back.
      const postRow = db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(session.id) as Parameters<typeof rowToSession>[0] | undefined
      if (postRow) {
        const cfg = JSON.parse(postRow.config) as SessionConfig
        if (cfg.triggers) {
          cfg.triggers = cfg.triggers.map((t) =>
            t.id === trigger.id
              ? { ...t, last_fired_at: new Date().toISOString() }
              : t,
          )
          db.prepare(
            'UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?',
          ).run(JSON.stringify(cfg), new Date().toISOString(), session.id)
        }
      }
    },
  })
}

/** Re-read a session and reconcile its registered triggers. Call after
 *  any session.config mutation that touches `triggers`. */
export function reconcileSessionTriggers(session: Session): void {
  unregisterAllForSession(session.id)
  for (const t of session.config.triggers ?? []) {
    registerTrigger(session.id, t)
  }
}

/** Used by /api/sessions DELETE to clean up before the row is gone. */
export function dropSession(sessionId: string): void {
  unregisterAllForSession(sessionId)
}

// Exposed only for testing/inspection
export const _scheduler = { tasks }
