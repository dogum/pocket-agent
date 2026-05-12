// =====================================================================
// streamSession — the core agent-run helper.
//
// Two non-negotiable patterns from the Managed Agents docs:
//
//   1. STREAM-FIRST ORDERING. Open the SSE event stream BEFORE sending
//      the kickoff `user.message`. Reverse the order and early agent
//      events arrive in a buffered batch — you lose real-time reactivity.
//
//   2. IDLE-BREAK GATE. `session.status_idle` fires transiently while
//      the agent waits on tool confirmations / custom tool results.
//      Only break on `status_terminated` or on `status_idle` whose
//      stop_reason.type is NOT `requires_action` (typically `end_turn`).
//
// As an async generator we yield RunEvents the route can push out as
// SSE. The route has no awareness of the SDK shape — that's contained
// here. To extend the loop's reactivity, add an event yield site here
// and a corresponding RunEvent variant in shared/events.ts.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'

import type { ArtifactDraft, RunEvent } from '../../shared/index.js'
import { classifyError } from '../client.js'
import { parseArtifact } from './parseArtifact.js'

export interface StreamSessionInput {
  client: Anthropic
  agentId: string
  environmentId: string
  /** Local session id — embedded in events so the consumer can correlate. */
  localSessionId: string
  /** Optional ingest id — embedded for the same reason. */
  ingestId?: string
  /** What to send to the agent. */
  promptText: string
  /** File resources to mount at /mnt/session/uploads. */
  fileIds?: string[]
  /** Title for the managed-agent session (purely cosmetic). */
  title?: string
  /**
   * If set, attempt to reuse this managed-agent session instead of
   * creating a fresh one. We pre-flight a `sessions.retrieve()` and
   * fall back to create-new on:
   *   • 404 (session is gone)
   *   • a status that indicates the session can't take a new
   *     user.message (terminated, requires_action, errored)
   * `streaming` is treated as transient — the caller is responsible
   * for not double-sending while a run is in flight (we have a queue
   * on the client).
   */
  existingManagedSessionId?: string
}

export interface StreamSessionResult {
  exitReason: 'end_turn' | 'requires_action' | 'terminated' | 'error' | 'parse_error'
  draft?: ArtifactDraft
  managedSessionId?: string
  /** True if this run created a new managed session (vs reused one). */
  createdManagedSession?: boolean
  errorMessage?: string
}

export type RunExitReason = StreamSessionResult['exitReason']

/** Map a run's exit reason to a value that fits the `sessions.run_status`
 *  CHECK constraint (streaming | idle | requires_action | terminated |
 *  error). `parse_error` collapses to `error` and `end_turn` to `idle`
 *  so callers can write run_status without a SQLite constraint blowup
 *  on reflex / artifact-update / trigger paths. */
export function exitReasonToRunStatus(
  reason: RunExitReason,
): 'idle' | 'requires_action' | 'terminated' | 'error' {
  switch (reason) {
    case 'end_turn':
      return 'idle'
    case 'requires_action':
      return 'requires_action'
    case 'terminated':
      return 'terminated'
    case 'error':
    case 'parse_error':
      return 'error'
  }
}

/** Anthropic-side statuses we know how to send a user.message to. We
 *  treat anything else (terminated / requires_action / errored / unknown)
 *  as a signal to start fresh. */
const RESUMABLE_STATUSES = new Set(['idle', 'pending'])

export async function* streamSession(
  input: StreamSessionInput,
): AsyncGenerator<RunEvent, StreamSessionResult> {
  const startedAt = Date.now()
  const runId = `run_${startedAt.toString(36)}_${Math.random().toString(36).slice(2, 6)}`

  // ── 1. Resolve the managed session ──────────────────────────
  // Try to reuse the existing one if its status looks resumable; fall
  // back to creating a fresh one on any signal it isn't.
  let session: { id: string }
  let createdManagedSession = false

  if (input.existingManagedSessionId) {
    try {
      const remote = (await input.client.beta.sessions.retrieve(
        input.existingManagedSessionId,
      )) as { id: string; status?: string }
      const status = remote.status ?? 'unknown'
      if (RESUMABLE_STATUSES.has(status)) {
        session = remote
      } else {
        // Fall through to create.
        session = await createFresh(input)
        createdManagedSession = true
      }
    } catch {
      // 404 or transport error — treat as gone, create fresh.
      try {
        session = await createFresh(input)
        createdManagedSession = true
      } catch (err) {
        const c = classifyError(err)
        yield { type: 'run.error', kind: c.kind, message: c.message }
        return { exitReason: 'error', errorMessage: c.message }
      }
    }
  } else {
    try {
      session = await createFresh(input)
      createdManagedSession = true
    } catch (err) {
      const c = classifyError(err)
      yield { type: 'run.error', kind: c.kind, message: c.message }
      return { exitReason: 'error', errorMessage: c.message }
    }
  }

  yield {
    type: 'run.started',
    run_id: runId,
    session_id: input.localSessionId,
    managed_session_id: session.id,
    ingest_id: input.ingestId,
    started_at: new Date(startedAt).toISOString(),
  }

  // ── 2. Open the stream BEFORE sending the kickoff event ─────
  let stream: AsyncIterable<unknown>
  try {
    stream = await input.client.beta.sessions.events.stream(session.id)
  } catch (err) {
    const c = classifyError(err)
    yield { type: 'run.error', kind: c.kind, message: c.message }
    return {
      exitReason: 'error',
      managedSessionId: session.id,
      createdManagedSession,
      errorMessage: c.message,
    }
  }

  // ── 3. Send the kickoff user.message ─────────────────────────
  try {
    await input.client.beta.sessions.events.send(session.id, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: input.promptText }],
        },
      ],
    })
  } catch (err) {
    const c = classifyError(err)
    yield { type: 'run.error', kind: c.kind, message: c.message }
    return {
      exitReason: 'error',
      managedSessionId: session.id,
      createdManagedSession,
      errorMessage: c.message,
    }
  }

  // ── 4. Drain the stream ─────────────────────────────────────
  let agentText = ''
  let usage: RunEvent extends { type: 'run.done'; usage?: infer U } ? U : never = undefined as never

  yield { type: 'run.status', status: 'streaming' }

  try {
    for await (const rawEvent of stream) {
      const event = rawEvent as { type: string } & Record<string, unknown>
      switch (event.type) {
        case 'agent.message': {
          const blocks = (event.content as Array<Record<string, unknown>>) ?? []
          for (const block of blocks) {
            switch (block.type) {
              case 'text': {
                const t = String(block.text ?? '')
                if (t) {
                  agentText += t
                  yield { type: 'agent.text_delta', text: t }
                }
                break
              }
              case 'tool_use': {
                yield {
                  type: 'agent.tool_use',
                  tool: String(block.name ?? 'unknown'),
                  brief: typeof block.input === 'object'
                    ? briefForTool(block.name as string, block.input as Record<string, unknown>)
                    : undefined,
                }
                break
              }
              case 'tool_result': {
                yield {
                  type: 'agent.tool_result',
                  tool: 'tool_result',
                  is_error: Boolean(block.is_error),
                }
                break
              }
              case 'thinking': {
                yield {
                  type: 'agent.thinking',
                  text:
                    typeof block.thinking === 'string'
                      ? truncateForUI(block.thinking, 80)
                      : undefined,
                }
                break
              }
              default:
                // Unknown block types — ignore.
                break
            }
          }
          break
        }

        case 'span.model_request_end': {
          const u = event.model_usage as Record<string, unknown> | undefined
          if (u) {
            usage = {
              input_tokens: Number(u.input_tokens ?? 0),
              output_tokens: Number(u.output_tokens ?? 0),
              cache_read_input_tokens: Number(u.cache_read_input_tokens ?? 0),
              cache_creation_input_tokens: Number(u.cache_creation_input_tokens ?? 0),
            } as never
          }
          break
        }

        case 'session.status_terminated': {
          yield { type: 'run.status', status: 'terminated' }
          yield {
            type: 'run.done',
            duration_ms: Date.now() - startedAt,
            usage,
          }
          return {
            exitReason: 'terminated',
            managedSessionId: session.id,
      createdManagedSession,
          }
        }

        case 'session.status_idle': {
          // Idle-break gate.
          const stop = event.stop_reason as
            | { type?: string }
            | undefined
          const stopType = stop?.type
          if (stopType === 'requires_action') {
            yield { type: 'run.status', status: 'requires_action' }
            yield {
              type: 'run.done',
              duration_ms: Date.now() - startedAt,
              usage,
            }
            return {
              exitReason: 'requires_action',
              managedSessionId: session.id,
      createdManagedSession,
            }
          }

          // Genuine end. Parse the agent's text as an artifact.
          const parsed = parseArtifact(agentText)
          if (parsed.ok) {
            // Note: caller materializes the Artifact (assigning id, session_id,
            // created_at) and re-emits artifact.ready downstream. We don't emit
            // it here because we don't own the persistence layer.
            yield { type: 'run.status', status: 'idle', stop_reason: stopType }
            yield {
              type: 'run.done',
              duration_ms: Date.now() - startedAt,
              usage,
            }
            return {
              exitReason: 'end_turn',
              draft: parsed.draft,
              managedSessionId: session.id,
      createdManagedSession,
            }
          } else {
            yield {
              type: 'run.error',
              kind: 'parse',
              message: `Could not parse Artifact JSON: ${parsed.error}`,
            }
            yield {
              type: 'run.done',
              duration_ms: Date.now() - startedAt,
              usage,
            }
            return {
              exitReason: 'parse_error',
              managedSessionId: session.id,
      createdManagedSession,
              errorMessage: parsed.error,
            }
          }
        }

        default:
          // Other events (span.*, session.*) we don't surface yet.
          break
      }
    }
  } catch (err) {
    const c = classifyError(err)
    yield { type: 'run.error', kind: c.kind, message: c.message }
    return {
      exitReason: 'error',
      managedSessionId: session.id,
      createdManagedSession,
      errorMessage: c.message,
    }
  }

  // Stream ended without a terminal event — treat as terminated.
  yield {
    type: 'run.done',
    duration_ms: Date.now() - startedAt,
    usage,
  }
  return { exitReason: 'terminated', managedSessionId: session.id }
}

async function createFresh(
  input: StreamSessionInput,
): Promise<{ id: string }> {
  return input.client.beta.sessions.create({
    agent: input.agentId,
    environment_id: input.environmentId,
    title: input.title ?? `pocket-agent · ${new Date().toISOString()}`,
    resources:
      input.fileIds && input.fileIds.length > 0
        ? input.fileIds.map((fileId) => ({
            type: 'file' as const,
            file_id: fileId,
          }))
        : undefined,
  })
}

function truncateForUI(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1).trim()}…`
}

function briefForTool(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  switch (toolName) {
    case 'bash':
      return typeof input.command === 'string'
        ? truncateForUI(input.command, 80)
        : undefined
    case 'web_search':
      return typeof input.query === 'string'
        ? truncateForUI(input.query, 60)
        : undefined
    case 'web_fetch':
      return typeof input.url === 'string' ? input.url : undefined
    case 'read':
    case 'write':
    case 'edit':
      return typeof input.path === 'string' ? input.path : undefined
    case 'glob':
      return typeof input.pattern === 'string' ? input.pattern : undefined
    case 'grep':
      return typeof input.pattern === 'string'
        ? truncateForUI(input.pattern, 50)
        : undefined
    default:
      return undefined
  }
}
