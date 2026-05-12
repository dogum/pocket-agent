// =====================================================================
// Source / Observation / Reflex — the ambient-agent primitives.
//
// A `Source` is a long-lived connection to an external feed (an MCP
// server, a webhook drop, a polled URL, or the built-in `demo` source).
// Sources emit `Observation`s into a per-source ring buffer. Sessions
// attach to one or more sources so that the agent receives recent
// observations as context on every run.
//
// A `Reflex` is an agent-authored watcher attached to a session:
// "when `fake_pulse.energy < 30` AND session is `marathon`, run the
// agent with this kickoff." Reflexes start life as `reflex_proposal`
// artifact components the user approves; once approved they fire
// automatically on matching observations (debounced).
//
// Living artifacts use the same matching primitive via the
// `Artifact.subscribes_to` field — when matched, the agent re-runs
// the artifact in place.
// =====================================================================

// ─── Source ──────────────────────────────────────────────────────────

export type SourceKind = 'mcp' | 'webhook' | 'polled_url' | 'demo'
export type SourceStatus =
  | 'connected'
  | 'disconnected'
  | 'configuring'
  | 'error'
  | 'paused'

export interface SourceMcpConfig {
  kind: 'mcp'
  /** HTTPS or HTTP+SSE endpoint of the MCP server. */
  endpoint: string
  /** Name of the env var that holds the bearer token, if any. */
  auth_env_var?: string
  /** Optional subscribe filter (e.g. an MCP server emits many event types). */
  subscribe?: string[]
}

export interface SourceWebhookConfig {
  kind: 'webhook'
  /** Name of the env var that holds the HMAC secret, if any. */
  secret_env_var?: string
  /** Path the webhook posts to (server expands to /api/sources/webhook/<path>). */
  path: string
}

export interface SourcePolledUrlConfig {
  kind: 'polled_url'
  url: string
  /** Cron tick cadence in seconds (clamped to >= 30). */
  poll_seconds: number
  /** Optional static headers (auth, accept). */
  headers?: Record<string, string>
  /** JSON path into the response that yields the payload (default: root). */
  payload_path?: string
}

export interface SourceDemoConfig {
  kind: 'demo'
  /** Cadence in seconds. Defaults to 60. */
  cadence_seconds: number
}

export type SourceConfig =
  | SourceMcpConfig
  | SourceWebhookConfig
  | SourcePolledUrlConfig
  | SourceDemoConfig

export interface Source {
  id: string
  /** kind matches `config.kind` — duplicated for index-friendly queries. */
  kind: SourceKind
  /** Short slug — referenced from observations & the agent prompt. */
  name: string
  /** Display label. */
  label: string
  /** Optional one-line description shown on the card. */
  description?: string
  status: SourceStatus
  config: SourceConfig
  enabled: boolean
  last_observation_at?: string
  last_error?: string
  /** Observation cap — old observations are evicted past this. */
  ring_buffer_size: number
  created_at: string
  updated_at: string
}

/** Default ring-buffer cap if a source doesn't set one. */
export const DEFAULT_RING_BUFFER_SIZE = 200

// ─── Observation ─────────────────────────────────────────────────────

export interface Observation {
  id: string
  source_id: string
  observed_at: string
  /** Free-form structured payload — JSON object the agent reads. */
  payload: Record<string, unknown>
  /** Compact one-liner the agent sees in <recent_observations>. */
  summary: string
}

// ─── Reflex match (also used by Artifact.subscribes_to) ──────────────

export type ReflexOp =
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eq'
  | 'neq'
  | 'contains'
  | 'in_range'

export interface ReflexCondition {
  /** Dot path into the observation payload (e.g. "energy", "weather.temp_c"). */
  path: string
  op: ReflexOp
  /** Number for lt/lte/gt/gte/eq/neq. String for contains/eq/neq. [min, max] for in_range. */
  value: number | string | [number, number]
}

export interface ReflexMatch {
  source_id: string
  /** AND of all conditions. Empty array → match every observation from the source. */
  conditions: ReflexCondition[]
}

// ─── Reflex ──────────────────────────────────────────────────────────

export interface Reflex {
  id: string
  session_id: string
  /** Plain-language description for the UI ("when energy < 30 in the morning…"). */
  description: string
  match: ReflexMatch
  /** Prompt sent to the agent when the reflex fires. */
  kickoff_prompt: string
  /** Optional artifact-type hint for the agent. */
  artifact_hint?: string
  /** Minimum seconds between fires. Defaults to 300. */
  debounce_seconds: number
  last_fired_at?: string
  fire_count: number
  /** True once the user has approved the agent's proposal. */
  approved: boolean
  /** False to pause without deleting. */
  enabled: boolean
  created_at: string
  updated_at: string
}

// ─── Living artifacts ────────────────────────────────────────────────

export interface ArtifactSubscription {
  source_id: string
  /** Empty array → every observation from the source triggers an update. */
  conditions?: ReflexCondition[]
}

/** A snapshot of an artifact before it was updated in place. The
 *  artifact_versions table accumulates these as a history. */
export interface ArtifactVersion {
  id: string
  artifact_id: string
  /** Position in the version history (0 = original, 1 = first update, …). */
  version: number
  header: import('./artifact.js').ArtifactHeader
  components: import('./artifact.js').ArtifactComponent[]
  /** The observation that triggered the update, if any (null for the initial version). */
  triggering_observation_id?: string
  /** Compact reason text shown in the history sheet ("Updated from fake_pulse: energy 18"). */
  reason?: string
  created_at: string
}

// ─── Session attachment ──────────────────────────────────────────────

export interface SessionSource {
  session_id: string
  source_id: string
  attached_at: string
}

// ─── Run-queue priority (shared so UI + server agree) ────────────────

export type RunPriority = 'user' | 'reflex' | 'artifact_update' | 'trigger'

export const PRIORITY_ORDER: Record<RunPriority, number> = {
  user: 0,
  trigger: 1,
  reflex: 2,
  artifact_update: 3,
}

/** Human-readable banner text for the "agent is working on …" hint. */
export function priorityBanner(priority: RunPriority): string {
  switch (priority) {
    case 'user':
      return 'Agent is working'
    case 'trigger':
      return 'Agent is on a scheduled run'
    case 'reflex':
      return 'Agent is on a reflex'
    case 'artifact_update':
      return 'Agent is updating an artifact'
  }
}

// ─── Evaluator (pure — also runs in the browser for preview UI) ─────

/** Evaluate a list of ReflexConditions against an observation's payload.
 *  AND semantics across conditions. Returns true iff all match.
 *
 *  Defensive: a non-array `conditions` (legacy/corrupt data, or a
 *  caller that bypassed validation) is treated as "no conditions" —
 *  matches everything — rather than throwing. We also skip any item
 *  that isn't a recognisable ReflexCondition shape. Route handlers
 *  still validate at write time; this is just so a poll/observation
 *  loop can't crash from a single bad row. */
export function evaluateConditions(
  conditions: ReflexCondition[],
  payload: Record<string, unknown>,
): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true
  for (const c of conditions) {
    if (!c || typeof c !== 'object') continue
    if (typeof c.path !== 'string' || typeof c.op !== 'string') continue
    if (!evaluateOne(c, payload)) return false
  }
  return true
}

function evaluateOne(
  c: ReflexCondition,
  payload: Record<string, unknown>,
): boolean {
  const v = readPath(payload, c.path)
  switch (c.op) {
    case 'lt':
      return typeof v === 'number' && typeof c.value === 'number' && v < c.value
    case 'lte':
      return typeof v === 'number' && typeof c.value === 'number' && v <= c.value
    case 'gt':
      return typeof v === 'number' && typeof c.value === 'number' && v > c.value
    case 'gte':
      return typeof v === 'number' && typeof c.value === 'number' && v >= c.value
    case 'eq':
      return v === c.value
    case 'neq':
      return v !== c.value
    case 'contains':
      if (typeof v === 'string' && typeof c.value === 'string') {
        return v.toLowerCase().includes(c.value.toLowerCase())
      }
      if (Array.isArray(v)) return v.includes(c.value as never)
      return false
    case 'in_range':
      if (
        typeof v === 'number' &&
        Array.isArray(c.value) &&
        c.value.length === 2 &&
        typeof c.value[0] === 'number' &&
        typeof c.value[1] === 'number'
      ) {
        return v >= c.value[0] && v <= c.value[1]
      }
      return false
  }
}

function readPath(
  payload: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.')
  let cur: unknown = payload
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Render a short human description of a condition. Used in the UI
 *  ("energy < 30", "weather.temp_c in 5–15"). */
export function describeCondition(c: ReflexCondition): string {
  switch (c.op) {
    case 'lt':
      return `${c.path} < ${c.value}`
    case 'lte':
      return `${c.path} ≤ ${c.value}`
    case 'gt':
      return `${c.path} > ${c.value}`
    case 'gte':
      return `${c.path} ≥ ${c.value}`
    case 'eq':
      return `${c.path} = ${c.value}`
    case 'neq':
      return `${c.path} ≠ ${c.value}`
    case 'contains':
      return `${c.path} contains "${c.value}"`
    case 'in_range':
      if (Array.isArray(c.value)) {
        return `${c.path} in ${c.value[0]}–${c.value[1]}`
      }
      return `${c.path} in range`
  }
}
