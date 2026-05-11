// Thin fetch wrapper. Vite dev server proxies /api/* to the Hono
// server on :8787. In a packaged build the same path is served
// from the same origin so this just works.

import type {
  Artifact,
  Briefing,
  FeedResponse,
  Ingest,
  IngestType,
  Session,
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
