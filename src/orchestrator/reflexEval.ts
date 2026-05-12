// =====================================================================
// reflexEval — fire a single reflex.
//
// Called from `observations.ts` when an observation matches an approved,
// enabled reflex (and the debounce gate has passed). We:
//
//   1. Enqueue an agent run on the reflex's session via the shared run
//      queue (priority 'reflex' — below 'user' and 'trigger', above
//      'artifact_update').
//   2. Build a kickoff prompt: the reflex's `kickoff_prompt` plus a
//      compact <triggering_observation> block.
//   3. Drain `streamSession()` server-side.
//   4. Persist the resulting Artifact (if any).
//   5. Bump the reflex's `last_fired_at` + `fire_count`.
//   6. Publish a `reflex.fired` event for the UI.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { Database as DB } from 'better-sqlite3'

import type {
  Observation,
  Reflex,
  Source,
} from '../../shared/index.js'
import {
  getReflex,
  rowToSession,
  updateReflex,
} from '../db.js'
import { publish } from '../lib/eventBus.js'
import * as log from '../lib/log.js'
import { enqueueRun } from '../lib/runQueue.js'
import { buildPrompt } from './buildPrompt.js'
import { persistArtifact } from './persistArtifact.js'
import { streamSession } from './streamSession.js'

export interface FireReflexInput {
  db: DB
  client: Anthropic
  getAgent: () => { agent_id: string; environment_id: string } | null
  reflex: Reflex
  source: Source
  observation: Observation
}

export async function fireReflex(input: FireReflexInput): Promise<void> {
  const { db, client, getAgent, reflex, source, observation } = input

  const description = `Reflex: ${reflex.description}`
  await enqueueRun({
    sessionId: reflex.session_id,
    priority: 'reflex',
    description,
    run: async () => {
      const agent = getAgent()
      if (!agent) {
        log.warn('reflex · no agent provisioned')
        return
      }

      // Re-read the reflex to pick up any updates (debounce/enabled toggles).
      const fresh = getReflex(db, reflex.id)
      if (!fresh || !fresh.enabled || !fresh.approved) return

      const sessionRow = db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(reflex.session_id) as
        | Parameters<typeof rowToSession>[0]
        | undefined
      if (!sessionRow) return
      const session = rowToSession(sessionRow)

      // Build a virtual ingest so we can reuse buildPrompt — the reflex
      // prompt is the "new input".
      const ingestId = `ing_reflex_${reflex.id}_${Date.now().toString(36)}`
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO ingests (id, session_id, type, file_url, raw_text, metadata, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ingestId,
        session.id,
        'share',
        null,
        fresh.kickoff_prompt,
        JSON.stringify({
          timestamp: now,
          source_app: 'reflex',
          reflex_id: reflex.id,
          source_name: source.name,
          observation_id: observation.id,
        }),
        'processing',
        now,
      )

      const prompt = buildPrompt({
        session,
        ingest: {
          id: ingestId,
          session_id: session.id,
          type: 'share',
          raw_text: fresh.kickoff_prompt,
          metadata: { timestamp: now, source_app: 'reflex' },
          status: 'processing',
          created_at: now,
        },
        db,
      })

      // Augment the prompt with the triggering-observation block.
      const promptText = `${prompt.text}

## Triggering observation (source: ${source.name})
${observation.summary}

\`\`\`json
${JSON.stringify(observation.payload, null, 2)}
\`\`\`

You were configured to fire on this pattern: "${fresh.description}"${fresh.artifact_hint ? `. Suggested artifact type: ${fresh.artifact_hint}.` : '.'}`

      const gen = streamSession({
        client,
        agentId: agent.agent_id,
        environmentId: agent.environment_id,
        localSessionId: session.id,
        ingestId,
        promptText,
        fileIds: prompt.fileIds,
        title: `[reflex] ${fresh.description}`,
        existingManagedSessionId: session.managed_session_id ?? undefined,
      })

      let result = await gen.next()
      while (!result.done) {
        // Forward each run event on the bus so the UI can mirror it.
        publish({
          type: 'run',
          event: result.value,
          session_id: session.id,
          priority: 'reflex',
        })
        result = await gen.next()
      }
      const final = result.value

      // Update managed-session linkage.
      if (final.managedSessionId) {
        db.prepare(
          'UPDATE sessions SET managed_session_id = ?, run_status = ? WHERE id = ?',
        ).run(
          final.managedSessionId,
          final.exitReason === 'end_turn' ? 'idle' : final.exitReason,
          session.id,
        )
      }

      // Persist artifact if any.
      if (final.exitReason === 'end_turn' && final.draft) {
        const artifact = persistArtifact({
          db,
          sessionId: session.id,
          draft: final.draft,
        })
        db.prepare('UPDATE ingests SET status = ? WHERE id = ?').run(
          'processed',
          ingestId,
        )
        publish({
          type: 'run',
          event: { type: 'artifact.ready', artifact },
          session_id: session.id,
          priority: 'reflex',
        })
      } else {
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run('failed', final.errorMessage ?? final.exitReason, ingestId)
      }

      // Bump fire_count — last_fired_at was reserved at enqueue time
      // by observations.ingestObservation so the debounce gate doesn't
      // race against in-flight runs. We only count completed runs here.
      const next = {
        ...fresh,
        fire_count: fresh.fire_count + 1,
        updated_at: new Date().toISOString(),
      }
      updateReflex(db, next)

      publish({
        type: 'reflex.fired',
        reflex_id: fresh.id,
        session_id: session.id,
        triggering_observation_id: observation.id,
      })

      log.ok(
        `reflex · fired "${fresh.description}" (fires: ${next.fire_count})`,
      )
    },
  })
}
