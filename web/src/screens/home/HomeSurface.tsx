import type { JSX } from 'react'

import { useResolvedExperience } from '../../design/useExperience'
import { useAppStore } from '../../store/useAppStore'
import { DailyEditionHome } from './DailyEditionHome'
import { FieldJournalHome } from './FieldJournalHome'
import { ObservatoryHome } from './ObservatoryHome'
import { QuietAtriumHome } from './QuietAtriumHome'
import { WorkbenchHome } from './WorkbenchHome'

export function HomeSurface(): JSX.Element {
  const experience = useResolvedExperience()
  const data = {
    briefing: useAppStore((s) => s.briefing),
    artifacts: useAppStore((s) => s.artifacts),
    sessions: useAppStore((s) => s.sessions),
    activeRun: useAppStore((s) => s.activeRunId !== null),
    liveText: useAppStore((s) => s.liveText),
    liveTool: useAppStore((s) => s.liveTool),
    lastRunError: useAppStore((s) => s.lastRunError),
    queuedCount: useAppStore((s) => s.queuedRuns.length),
    go: useAppStore((s) => s.go),
  }

  switch (experience) {
    case 'field_journal':
      return <FieldJournalHome {...data} />
    case 'daily_edition':
      return <DailyEditionHome {...data} />
    case 'workbench':
      return <WorkbenchHome {...data} />
    case 'quiet_atrium':
      return <QuietAtriumHome {...data} />
    case 'observatory':
    default:
      return <ObservatoryHome {...data} />
  }
}
