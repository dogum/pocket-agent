// Tiny Zustand store for client state. Routing, sheets, cached data,
// and ephemeral run state.
//
// Why no URL routing? This is a single-screen mobile-style shell with
// modal stacks. A small route enum is more honest about what we have
// and faster to reason about. We can graduate to URL routing if/when
// we want shareable links into specific artifacts.

import { create } from 'zustand'

import type {
  Artifact,
  Briefing,
  Ingest,
  Session,
  Source,
} from '@shared/index'

export type Route =
  | { name: 'feed' }
  | { name: 'artifact'; id: string }
  | { name: 'sessions' }
  | { name: 'session'; id: string }
  | { name: 'search' }
  | { name: 'profile' }
  | { name: 'onboarding' }
  | { name: 'privacy' }
  | { name: 'triggers' }
  | { name: 'component-library' }
  | { name: 'agent-states' }
  | { name: 'sources' }
  | { name: 'source'; id: string }

export interface ProfileSummary {
  name: string
  stats: { sessions: number; artifacts: number; sources: number }
}

export interface AppStore {
  // ─── Routing ──────────────────────────────────────────────────
  route: Route
  history: Route[]
  go: (next: Route) => void
  back: () => void
  setRoot: (route: Route) => void

  // ─── Sheets ───────────────────────────────────────────────────
  showIngest: boolean
  setShowIngest: (v: boolean) => void
  shareTarget: Artifact | null
  setShareTarget: (a: Artifact | null) => void

  // ─── Server state cache ───────────────────────────────────────
  sessions: Session[]
  artifacts: Artifact[]
  briefing: Briefing | null
  recentIngests: Ingest[]
  agentReady: boolean
  loaded: boolean
  profile: ProfileSummary | null
  sources: Source[]
  setData: (
    data: Partial<
      Pick<
        AppStore,
        | 'sessions'
        | 'artifacts'
        | 'briefing'
        | 'recentIngests'
        | 'agentReady'
        | 'loaded'
        | 'profile'
        | 'sources'
      >
    >,
  ) => void
  upsertArtifact: (a: Artifact) => void
  upsertSession: (s: Session) => void
  upsertSource: (s: Source) => void
  removeSource: (id: string) => void

  // ─── Ambient activity banner ──────────────────────────────────
  /** When set, the global scan-bar reflects a server-initiated run
   *  ("agent is on a reflex", "agent updating an artifact", …). */
  ambientRun:
    | {
        session_id: string
        priority: string
        description: string
      }
    | null
  setAmbientRun: (run: AppStore['ambientRun']) => void

  // ─── Run state ────────────────────────────────────────────────
  /** Active /api/run id when one is streaming, else null. */
  activeRunId: string | null
  /** Latest agent text the user can see streaming. */
  liveText: string
  /** Latest tool the agent picked up, for the scan-bar copy. */
  liveTool: string | null
  setRun: (data: Partial<Pick<AppStore, 'activeRunId' | 'liveText' | 'liveTool'>>) => void
  clearRun: () => void

  // ─── Queue ────────────────────────────────────────────────────
  /** Pending runs that arrived while another was in flight. */
  queuedRuns: Array<{ sessionId: string; ingestId: string }>
  enqueueRun: (item: { sessionId: string; ingestId: string }) => void
  dequeueRun: () => { sessionId: string; ingestId: string } | undefined
}

export const useAppStore = create<AppStore>((set, get) => ({
  route: { name: 'feed' },
  history: [],
  go: (next) =>
    set((s) => ({ history: [...s.history, s.route], route: next })),
  back: () =>
    set((s) => {
      if (s.history.length === 0) return { route: { name: 'feed' }, history: [] }
      const prev = s.history[s.history.length - 1]
      return { route: prev, history: s.history.slice(0, -1) }
    }),
  setRoot: (route) => set({ route, history: [] }),

  showIngest: false,
  setShowIngest: (v) => set({ showIngest: v }),
  shareTarget: null,
  setShareTarget: (a) => set({ shareTarget: a }),

  sessions: [],
  artifacts: [],
  briefing: null,
  recentIngests: [],
  agentReady: false,
  loaded: false,
  profile: null,
  sources: [],
  setData: (data) => set(data),
  upsertArtifact: (a) =>
    set((s) => {
      const idx = s.artifacts.findIndex((x) => x.id === a.id)
      if (idx === -1) return { artifacts: [a, ...s.artifacts] }
      const next = s.artifacts.slice()
      next[idx] = a
      return { artifacts: next }
    }),
  upsertSession: (newSession) =>
    set((s) => {
      const idx = s.sessions.findIndex((x) => x.id === newSession.id)
      if (idx === -1) return { sessions: [newSession, ...s.sessions] }
      const next = s.sessions.slice()
      next[idx] = newSession
      return { sessions: next }
    }),
  upsertSource: (newSource) =>
    set((s) => {
      const idx = s.sources.findIndex((x) => x.id === newSource.id)
      if (idx === -1) return { sources: [...s.sources, newSource] }
      const next = s.sources.slice()
      next[idx] = newSource
      return { sources: next }
    }),
  removeSource: (id) =>
    set((s) => ({ sources: s.sources.filter((x) => x.id !== id) })),

  ambientRun: null,
  setAmbientRun: (ambientRun) => set({ ambientRun }),

  activeRunId: null,
  liveText: '',
  liveTool: null,
  setRun: (data) => set(data),
  clearRun: () => set({ activeRunId: null, liveText: '', liveTool: null }),

  queuedRuns: [],
  enqueueRun: (item) =>
    set((s) => ({ queuedRuns: [...s.queuedRuns, item] })),
  dequeueRun: () => {
    const { queuedRuns } = get()
    if (queuedRuns.length === 0) return undefined
    const [next, ...rest] = queuedRuns
    set({ queuedRuns: rest })
    return next
  },
}))
