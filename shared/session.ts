// =====================================================================
// Session + Ingest types — the user's stream of inputs and the
// long-running agent threads they get routed to.
// =====================================================================

export type SessionStatus = 'active' | 'idle' | 'complete'
export type SessionRunStatus =
  | 'streaming'
  | 'idle'
  | 'requires_action'
  | 'terminated'
  | 'error'

export interface SessionConfig {
  /** Optional per-session prompt prepended to the agent's base system prompt. */
  system_prompt_addendum?: string
  /** MCP tool servers to enable for this session. */
  mcp_servers?: Array<{ name: string; url: string }>
  /** Cron triggers — fire scheduled agent runs in this session. */
  triggers?: Trigger[]
}

export interface Trigger {
  /** Stable id (caller-generated). */
  id: string
  /** Standard cron expression, e.g. `0 8 * * *` for 08:00 daily. */
  schedule: string
  /** Short label shown in the UI. */
  description: string
  /** Prompt the agent receives when the trigger fires. */
  prompt: string
  /** ISO timestamp of the most recent fire, if any. */
  last_fired_at?: string
  /** Set false to register but not fire. */
  enabled?: boolean
}

export interface Session {
  id: string
  /** Display name ("Marathon · Berlin", "315 Oak Ave"). */
  name: string
  description?: string
  status: SessionStatus
  /** Hidden from the default list when true. Triggers are paused. */
  archived: boolean
  /** The most recent terminal status from the managed-agents API. */
  run_status?: SessionRunStatus
  /** The id of the last managed-agent session this thread used. */
  managed_session_id?: string
  config: SessionConfig
  ingest_count: number
  artifact_count: number
  created_at: string
  updated_at: string
}

export type IngestType = 'photo' | 'voice' | 'file' | 'link' | 'text' | 'share'
export type IngestStatus =
  | 'pending'
  | 'routed'
  | 'processing'
  | 'processed'
  | 'failed'

export interface IngestMetadata {
  timestamp: string
  source_app?: string
  location?: { lat: number; lng: number }
  file_name?: string
  file_size?: number
  mime_type?: string
  /** Anthropic Files API id, set after upload. */
  file_id?: string
  /** Source URL for link ingests. */
  url?: string
}

export interface Ingest {
  id: string
  session_id: string | null
  type: IngestType
  /** Local filesystem path or signed URL — caller-provided. */
  file_url?: string
  raw_text?: string
  metadata: IngestMetadata
  status: IngestStatus
  error_message?: string
  created_at: string
}

// ─── Feed query ──────────────────────────────────────────────────────
export interface FeedQuery {
  session_id?: string | null
  before?: string // ISO timestamp cursor
  limit?: number
}

export interface FeedResponse {
  artifacts: import('./artifact.js').Artifact[]
  has_more: boolean
}
