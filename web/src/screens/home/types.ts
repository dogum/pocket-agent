import type { Artifact, Briefing, Session } from '@shared/index'
import type { Route } from '../../store/useAppStore'

export interface HomeSurfaceProps {
  briefing: Briefing | null
  artifacts: Artifact[]
  sessions: Session[]
  activeRun: boolean
  liveText: string
  liveTool: string | null
  lastRunError: string | null
  queuedCount: number
  go: (next: Route) => void
}
