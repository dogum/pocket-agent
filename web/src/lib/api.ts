// Thin fetch wrapper. Vite dev server proxies /api/* to the Hono
// server on :8787. In a packaged build the same path is served
// from the same origin so this just works.

import type {
  Artifact,
  ArtifactVersion,
  Briefing,
  FeedResponse,
  Ingest,
  IngestType,
  Observation,
  Reflex,
  ReflexMatch,
  Session,
  Source,
  SourceConfig,
  SourceKind,
  Trigger,
} from '@shared/index'

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, res.statusText, body)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export class ApiError extends Error {
  constructor(public status: number, public statusText: string, body: string) {
    super(`${status} ${statusText}: ${body}`)
  }
}

// ─── State ───────────────────────────────────────────────────────────

export interface AppState {
  agent: { id: string; version: number; prompt_hash: string } | null
  counts: { sessions: number; artifacts: number }
  first_run: boolean
}

export interface ProfileResponse {
  name: string
  created_at: string
  updated_at: string
  stats: { sessions: number; artifacts: number; sources: number }
}

export const api = {
  getState: () => request<AppState>('/state'),
  getProfile: () => request<ProfileResponse>('/profile'),
  updateProfile: (input: { name: string }) =>
    request<ProfileResponse>('/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  // Sessions
  listSessions: (filter?: 'active' | 'archived' | 'all') => {
    const qs =
      filter === 'archived' ? '?archived=1' : filter === 'all' ? '?archived=all' : ''
    return request<{ sessions: Session[] }>(`/sessions${qs}`)
  },
  createSession: (input: { name: string; description?: string }) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getSession: (id: string) => request<Session>(`/sessions/${id}`),
  updateSession: (id: string, patch: Partial<Session>) =>
    request<Session>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteSession: (id: string) =>
    request<{ ok: true }>(`/sessions/${id}`, { method: 'DELETE' }),
  /** Drop the local session's managed-Anthropic-session pin so the
   *  next ingest creates a fresh managed session on the agent's
   *  CURRENT version. Local rows (artifacts, ingests, sources) stay.
   *  Useful after `pnpm bootstrap-agent` to make existing sessions
   *  pick up an updated system prompt or tool set. */
  restartAgentThread: (id: string) =>
    request<Session>(`/sessions/${id}/restart-agent`, { method: 'POST' }),

  // Artifacts
  listArtifacts: (q?: { session_id?: string; before?: string; limit?: number }) => {
    const params = new URLSearchParams()
    if (q?.session_id) params.set('session_id', q.session_id)
    if (q?.before) params.set('before', q.before)
    if (q?.limit) params.set('limit', String(q.limit))
    const qs = params.toString()
    return request<FeedResponse>(`/artifacts${qs ? `?${qs}` : ''}`)
  },
  getArtifact: (id: string) => request<Artifact>(`/artifacts/${id}`),
  archiveArtifact: (id: string, archived: boolean) =>
    request<Artifact>(`/artifacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived }),
    }),
  latestBriefing: (sessionId?: string) => {
    const qs = sessionId ? `?session_id=${sessionId}` : ''
    return request<{ briefing: Briefing | null }>(
      `/artifacts/_briefings/latest${qs}`,
    )
  },

  // Ingests
  createIngest: (input: {
    session_id?: string | null
    type: IngestType
    raw_text?: string
    file_url?: string
    metadata?: Record<string, unknown>
  }) =>
    request<Ingest>('/ingests', { method: 'POST', body: JSON.stringify(input) }),
  uploadIngest: async (input: {
    session_id: string
    file: File
    type?: IngestType
  }): Promise<Ingest> => {
    const form = new FormData()
    form.append('session_id', input.session_id)
    form.append('file', input.file)
    if (input.type) form.append('type', input.type)
    const res = await fetch('/api/ingests', { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new ApiError(res.status, res.statusText, body)
    }
    return (await res.json()) as Ingest
  },
  listIngests: (sessionId?: string) => {
    const qs = sessionId ? `?session_id=${sessionId}` : ''
    return request<{ ingests: Ingest[] }>(`/ingests${qs}`)
  },

  // Search
  search: (q: string, limit = 20) => {
    const params = new URLSearchParams({ q, limit: String(limit) })
    return request<{ hits: SearchHit[]; query: string }>(
      `/search?${params.toString()}`,
    )
  },

  // Triggers
  listTriggers: (sessionId: string) =>
    request<{ triggers: Trigger[] }>(`/sessions/${sessionId}/triggers`),
  createTrigger: (
    sessionId: string,
    input: Pick<Trigger, 'schedule' | 'description' | 'prompt'> & {
      enabled?: boolean
    },
  ) =>
    request<Trigger>(`/sessions/${sessionId}/triggers`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTrigger: (
    sessionId: string,
    triggerId: string,
    patch: Partial<Pick<Trigger, 'schedule' | 'description' | 'prompt' | 'enabled'>>,
  ) =>
    request<Trigger>(`/sessions/${sessionId}/triggers/${triggerId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteTrigger: (sessionId: string, triggerId: string) =>
    request<{ ok: true }>(`/sessions/${sessionId}/triggers/${triggerId}`, {
      method: 'DELETE',
    }),

  // Data
  getDataSummary: () => request<DataSummary>('/data/summary'),
  exportDataUrl: '/api/data/export',
  clearAllData: () =>
    request<{ ok: true }>('/data/all', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'delete' }),
    }),

  // ── Phase 21 — Sources / Observations ──────────────────────────────
  listSources: () => request<{ sources: Source[] }>('/sources'),
  getSource: (id: string) => request<Source>(`/sources/${id}`),
  createSource: (input: {
    name: string
    label: string
    description?: string
    kind: SourceKind
    config: SourceConfig
    enabled?: boolean
    ring_buffer_size?: number
  }) =>
    request<Source>('/sources', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSource: (
    id: string,
    patch: Partial<{
      label: string
      description: string
      enabled: boolean
      config: SourceConfig
      ring_buffer_size: number
    }>,
  ) =>
    request<Source>(`/sources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteSource: (id: string) =>
    request<{ ok: true }>(`/sources/${id}`, { method: 'DELETE' }),
  listObservations: (sourceId: string, limit = 50) =>
    request<{ observations: Observation[] }>(
      `/sources/${sourceId}/observations?limit=${limit}`,
    ),
  emitObservation: (
    sourceId: string,
    input: { payload: Record<string, unknown>; summary?: string },
  ) =>
    request<{ observation: Observation }>(
      `/sources/${sourceId}/observations`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  attachSource: (sessionId: string, sourceId: string) =>
    request<{ ok: true }>(`/sources/${sourceId}/attach/${sessionId}`, {
      method: 'POST',
    }),
  detachSource: (sessionId: string, sourceId: string) =>
    request<{ ok: true }>(`/sources/${sourceId}/attach/${sessionId}`, {
      method: 'DELETE',
    }),
  sourcesForSession: (sessionId: string) =>
    request<{ sources: Source[] }>(`/sources/_for_session/${sessionId}`),

  // ── Phase 21 — Reflexes ────────────────────────────────────────────
  listReflexes: (sessionId: string) =>
    request<{ reflexes: Reflex[] }>(`/sessions/${sessionId}/reflexes`),
  createReflex: (
    sessionId: string,
    input: {
      description: string
      match?: ReflexMatch
      source_name?: string
      kickoff_prompt: string
      artifact_hint?: string
      debounce_seconds?: number
      approved?: boolean
    },
  ) =>
    request<Reflex>(`/sessions/${sessionId}/reflexes`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateReflex: (
    sessionId: string,
    reflexId: string,
    patch: Partial<{
      description: string
      match: ReflexMatch
      kickoff_prompt: string
      artifact_hint: string
      debounce_seconds: number
      approved: boolean
      enabled: boolean
    }>,
  ) =>
    request<Reflex>(`/sessions/${sessionId}/reflexes/${reflexId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteReflex: (sessionId: string, reflexId: string) =>
    request<{ ok: true }>(`/sessions/${sessionId}/reflexes/${reflexId}`, {
      method: 'DELETE',
    }),

  // ── Phase 21 — Artifact versions (living artifacts) ────────────────
  listArtifactVersions: (artifactId: string) =>
    request<{ versions: ArtifactVersion[] }>(
      `/events/artifacts/${artifactId}/versions`,
    ),
}

export interface DataSummary {
  counts: {
    sessions: number
    ingests: number
    artifacts: number
    file_uploads: number
  }
  paths: { db: string; upload_cache: string }
  upload_cache_bytes: number
}

export interface SearchHit {
  artifact: Artifact
  snippet: string
  rank: number
}

export type Api = typeof api
