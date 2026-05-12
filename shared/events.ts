// =====================================================================
// SSE event taxonomy — the contract between the server orchestrator
// (src/orchestrator/streamSession.ts) and the web client
// (web/src/hooks/useLiveStream.ts).
//
// We narrow the Anthropic SDK's wire vocabulary into a smaller, stable
// shape so the UI doesn't shift every time the API does. Add events
// only when a UI affordance needs them.
// =====================================================================

import type { Artifact, ArtifactDraft } from './artifact.js'

// ─── Run lifecycle events ────────────────────────────────────────────

export type RunEvent =
  | RunStartedEvent
  | AgentTextDeltaEvent
  | AgentToolUseEvent
  | AgentToolResultEvent
  | AgentThinkingEvent
  | ArtifactReadyEvent
  | ArtifactUpdatedEvent
  | RunStatusEvent
  | RunErrorEvent
  | RunDoneEvent
  | ObservationReceivedEvent
  | ReflexFiredEvent

export interface RunStartedEvent {
  type: 'run.started'
  run_id: string
  session_id: string
  managed_session_id: string
  ingest_id?: string
  started_at: string
}

export interface AgentTextDeltaEvent {
  type: 'agent.text_delta'
  text: string
}

export interface AgentToolUseEvent {
  type: 'agent.tool_use'
  /** "bash", "web_search", "read", etc. */
  tool: string
  /** Best-effort short description; the agent's choice of tool input. */
  brief?: string
}

export interface AgentToolResultEvent {
  type: 'agent.tool_result'
  tool: string
  /** True if the tool call produced an error. */
  is_error?: boolean
}

export interface AgentThinkingEvent {
  type: 'agent.thinking'
  /** Optional partial — the SDK may not always surface the text. */
  text?: string
}

export interface ArtifactReadyEvent {
  type: 'artifact.ready'
  artifact: Artifact
}

export interface ArtifactUpdatedEvent {
  type: 'artifact.updated'
  artifact: Artifact
  /** The observation that triggered the in-place update, if any. */
  triggering_observation_id?: string
}

/** Fired when a Source emits a new Observation. Used by the web client
 *  to refresh a Sources strip without a poll. */
export interface ObservationReceivedEvent {
  type: 'observation.received'
  source_id: string
  observation_id: string
  observed_at: string
  /** The summary line that lands in <recent_observations>. */
  summary: string
}

/** Fired when a reflex matches and the run queue accepts the job. */
export interface ReflexFiredEvent {
  type: 'reflex.fired'
  reflex_id: string
  session_id: string
  triggering_observation_id: string
}

export interface RunStatusEvent {
  type: 'run.status'
  status: 'streaming' | 'idle' | 'requires_action' | 'terminated'
  stop_reason?: string
}

export interface RunErrorEvent {
  type: 'run.error'
  message: string
  /** Categorized for UI handling (auth, rate, parse, etc.). */
  kind:
    | 'auth'
    | 'permission'
    | 'rate'
    | 'not_found'
    | 'api'
    | 'parse'
    | 'unknown'
}

export interface RunDoneEvent {
  type: 'run.done'
  /** Total runtime in milliseconds, server-measured. */
  duration_ms: number
  /** Token usage summary, when the SDK reports it. */
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * What we expect the agent to emit as its final text payload: a JSON
 * artifact draft. The server validates against this shape before
 * persisting and re-emitting via `artifact.ready`.
 */
export type AgentArtifactPayload = ArtifactDraft
