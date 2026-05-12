// /api/run — kick off an agent run on a session, stream events via SSE.
//
// Request body:  { session_id: string, ingest_id?: string }
// Response:      Server-Sent Events stream (see shared/events.ts for shape).
//
// Lifecycle:
//   1. Validate session + ingest exist.
//   2. Acquire the per-session run-queue slot (priority 'user') so
//      reflexes/triggers/updates don't collide.
//   3. Build the prompt, drain `streamSession()`, forward events as SSE.
//   4. On end_turn: persist Artifact via persistArtifact (resolves
//      subscribes_to source_name→source_id) and emit `artifact.ready`.

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
import { enqueueRun } from '../lib/runQueue.js'
import { buildPrompt } from '../orchestrator/buildPrompt.js'
import { persistArtifact } from '../orchestrator/persistArtifact.js'
import {
  exitReasonToRunStatus,
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

      if (!ingest) {
        await send({
          type: 'run.error',
          kind: 'unknown',
          message: 'ingest_id is required for now (Phase 6).',
        })
        return
      }

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

      // Enqueue so we never run concurrently with a reflex/trigger/update
      // for the same session. Resolves when the run completes.
      await enqueueRun({
        sessionId: session.id,
        priority: 'user',
        description: `User ingest: ${ingest.type}`,
        run: async () => {
          // Re-read the session NOW that we hold the per-session lock.
          // A prior run on this session may have just updated
          // managed_session_id; using the enqueue-time snapshot would
          // fork a fresh managed session and drop continuity.
          const freshRow = db
            .prepare('SELECT * FROM sessions WHERE id = ?')
            .get(session.id) as
            | Parameters<typeof rowToSession>[0]
            | undefined
          if (!freshRow) {
            await send({
              type: 'run.error',
              kind: 'not_found',
              message: 'session disappeared between enqueue and run',
            })
            return
          }
          const fresh = rowToSession(freshRow)

          const prompt = buildPrompt({ session: fresh, ingest, db })

          const generator = streamSession({
            client,
            agentId: agentState.agent_id,
            environmentId: agentState.environment_id,
            localSessionId: fresh.id,
            ingestId: ingest.id,
            promptText: prompt.text,
            fileIds: prompt.fileIds,
            title: fresh.name,
            existingManagedSessionId: fresh.managed_session_id ?? undefined,
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
            await send({
              type: 'run.error',
              kind: cls.kind,
              message: cls.message,
            })
            db.prepare(
              'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
            ).run('failed', cls.message, ingest.id)
            return
          }

          if (finalResult.managedSessionId) {
            db.prepare(
              'UPDATE sessions SET managed_session_id = ?, run_status = ? WHERE id = ?',
            ).run(
              finalResult.managedSessionId,
              exitReasonToRunStatus(finalResult.exitReason),
              session.id,
            )
          }

          if (finalResult.exitReason === 'end_turn' && finalResult.draft) {
            try {
              const artifact: Artifact = persistArtifact({
                db,
                sessionId: session.id,
                draft: finalResult.draft,
              })
              db.prepare('UPDATE ingests SET status = ? WHERE id = ?').run(
                'processed',
                ingest.id,
              )
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
            ).run(
              'failed',
              finalResult.errorMessage ?? 'parse error',
              ingest.id,
            )
          } else if (finalResult.exitReason === 'error') {
            db.prepare(
              'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
            ).run('failed', finalResult.errorMessage ?? 'error', ingest.id)
          }
        },
      })
    })
  })

  return app
}

export type { Artifact }
