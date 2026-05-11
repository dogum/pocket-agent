// /api/run — kick off an agent run on a session, stream events via SSE.
//
// Request body:  { session_id: string, ingest_id?: string }
// Response:      Server-Sent Events stream (see shared/events.ts for shape).
//
// Lifecycle:
//   1. Validate session + ingest exist.
//   2. Build prompt (recent context + new ingest).
//   3. Pipe `streamSession()` events to SSE.
//   4. On end_turn: persist Artifact, mark ingest 'processed', emit
//      `artifact.ready` with the final row (incl. server-assigned id).
//   5. On parse error: mark ingest 'failed' with error message.

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { Database as DB } from 'better-sqlite3'

import {
  classifyError,
  createClient,
  type Config,
} from '../client.js'
import {
  getAgentState,
  rowToIngest,
  rowToSession,
} from '../db.js'
import { newId } from '../lib/id.js'
import { buildPrompt } from '../orchestrator/buildPrompt.js'
import {
  streamSession,
  type StreamSessionResult,
} from '../orchestrator/streamSession.js'
import type { Artifact, RunEvent } from '../../shared/index.js'

export function runRoutes(config: Config, db: DB): Hono {
  const app = new Hono()
  const client = createClient(config)

  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Partial<{
      session_id: string
      ingest_id: string
    }> | null

    if (!body?.session_id) {
      return c.json({ error: 'session_id_required' }, 400)
    }

    const sessionRow = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(body.session_id) as Parameters<typeof rowToSession>[0] | undefined
    if (!sessionRow) {
      return c.json({ error: 'session_not_found' }, 404)
    }
    const session = rowToSession(sessionRow)

    let ingest = undefined as
      | undefined
      | ReturnType<typeof rowToIngest>
    if (body.ingest_id) {
      const ingestRow = db
        .prepare('SELECT * FROM ingests WHERE id = ?')
        .get(body.ingest_id) as Parameters<typeof rowToIngest>[0] | undefined
      if (!ingestRow) {
        return c.json({ error: 'ingest_not_found' }, 404)
      }
      ingest = rowToIngest(ingestRow)
    }

    const agentState = getAgentState(db)
    if (!agentState) {
      return streamSSE(c, async (stream) => {
        const event: RunEvent = {
          type: 'run.error',
          kind: 'unknown',
          message:
            'No agent provisioned. Run `pnpm bootstrap-agent` first to create one.',
        }
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        })
      })
    }

    return streamSSE(c, async (stream) => {
      const send = async (e: RunEvent): Promise<void> => {
        await stream.writeSSE({ event: e.type, data: JSON.stringify(e) })
      }

      // If we don't have an ingest, just send a quick error.
      if (!ingest) {
        await send({
          type: 'run.error',
          kind: 'unknown',
          message: 'ingest_id is required for now (Phase 6).',
        })
        return
      }

      // Mark the ingest as processing.
      try {
        db.prepare('UPDATE ingests SET status = ? WHERE id = ?').run(
          'processing',
          ingest.id,
        )
      } catch (e) {
        await send({
          type: 'run.error',
          kind: 'unknown',
          message: `db error: ${e instanceof Error ? e.message : String(e)}`,
        })
        return
      }

      const prompt = buildPrompt({ session, ingest, db })

      const generator = streamSession({
        client,
        agentId: agentState.agent_id,
        environmentId: agentState.environment_id,
        localSessionId: session.id,
        ingestId: ingest.id,
        promptText: prompt.text,
        fileIds: prompt.fileIds,
        // Title only labels the FIRST managed session — reused sessions
        // keep their original title.
        title: session.name,
        // Reuse the local session's managed-session if it's still alive.
        // streamSession does the pre-flight retrieve and falls back to
        // create on any non-resumable status or 404.
        existingManagedSessionId: session.managed_session_id ?? undefined,
      })

      let finalResult: StreamSessionResult
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const next = await generator.next()
          if (next.done) {
            finalResult = next.value
            break
          }
          await send(next.value)
        }
      } catch (err) {
        const cls = classifyError(err)
        await send({ type: 'run.error', kind: cls.kind, message: cls.message })
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run('failed', cls.message, ingest.id)
        return
      }

      // Update managed_session_id on the local session for resumability.
      if (finalResult.managedSessionId) {
        db.prepare(
          'UPDATE sessions SET managed_session_id = ?, run_status = ? WHERE id = ?',
        ).run(
          finalResult.managedSessionId,
          finalResult.exitReason === 'end_turn' ? 'idle' : finalResult.exitReason,
          session.id,
        )
      }

      // Persist the artifact, if we got one.
      if (finalResult.exitReason === 'end_turn' && finalResult.draft) {
        const id = newId('art')
        const created_at = new Date().toISOString()
        const draft = finalResult.draft

        try {
          db.prepare(`
            INSERT INTO artifacts (id, session_id, priority, notify, header, components, actions, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            session.id,
            draft.priority,
            draft.notify ? 1 : 0,
            JSON.stringify(draft.header),
            JSON.stringify(draft.components),
            JSON.stringify(draft.actions ?? []),
            created_at,
          )

          db.prepare('UPDATE ingests SET status = ? WHERE id = ?').run(
            'processed',
            ingest.id,
          )

          const artifact: Artifact = {
            id,
            session_id: session.id,
            priority: draft.priority,
            notify: draft.notify,
            header: draft.header,
            components: draft.components,
            actions: draft.actions,
            created_at,
          }
          await send({ type: 'artifact.ready', artifact })
        } catch (e) {
          await send({
            type: 'run.error',
            kind: 'unknown',
            message: `db insert failed: ${e instanceof Error ? e.message : String(e)}`,
          })
        }
      } else if (finalResult.exitReason === 'parse_error') {
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run('failed', finalResult.errorMessage ?? 'parse error', ingest.id)
      } else if (finalResult.exitReason === 'error') {
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run('failed', finalResult.errorMessage ?? 'error', ingest.id)
      }
    })
  })

  return app
}

// Re-export helpers used elsewhere (none right now). Placed here to silence
// the `_ingest` lint warning if/when we add more shape.
export type { Artifact }
