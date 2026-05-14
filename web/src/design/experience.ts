import type { Artifact, Session } from '@shared/index'
import type { ExperienceMode } from '../store/useSettings'

export interface ExperienceDefinition {
  id: ExperienceMode
  name: string
  shortName: string
  description: string
  captureVerb: string
  artifactNoun: string
  sessionNoun: string
  agentPresenceLabel: string
}

export type ResolvedExperienceMode = Exclude<ExperienceMode, 'adaptive'>

export const EXPERIENCES: Record<ExperienceMode, ExperienceDefinition> = {
  adaptive: {
    id: 'adaptive',
    name: 'Adaptive',
    shortName: 'Adaptive',
    description: 'Let the app choose a visual world as your artifacts accumulate.',
    captureVerb: 'Send',
    artifactNoun: 'artifact',
    sessionNoun: 'session',
    agentPresenceLabel: 'Agent working',
  },
  observatory: {
    id: 'observatory',
    name: 'The Observatory',
    shortName: 'Observatory',
    description: 'The agent as instrument, watching your territories.',
    captureVerb: 'Record',
    artifactNoun: 'observation',
    sessionNoun: 'constellation',
    agentPresenceLabel: 'Scanning',
  },
  field_journal: {
    id: 'field_journal',
    name: 'The Field Journal',
    shortName: 'Journal',
    description: 'A private notebook the agent fills on your behalf.',
    captureVerb: 'Pour',
    artifactNoun: 'entry',
    sessionNoun: 'volume',
    agentPresenceLabel: 'The agent is watching',
  },
  daily_edition: {
    id: 'daily_edition',
    name: 'The Daily Edition',
    shortName: 'Edition',
    description: 'The agent files dispatches from the beats of your life.',
    captureVerb: 'File',
    artifactNoun: 'dispatch',
    sessionNoun: 'beat',
    agentPresenceLabel: 'Wire active',
  },
  workbench: {
    id: 'workbench',
    name: 'The Workbench',
    shortName: 'Bench',
    description: 'Pieces on the bench, tools laid out, agent work visible.',
    captureVerb: 'Dispatch',
    artifactNoun: 'workpiece',
    sessionNoun: 'project',
    agentPresenceLabel: 'Bench running',
  },
  quiet_atrium: {
    id: 'quiet_atrium',
    name: 'The Quiet Atrium',
    shortName: 'Atrium',
    description: 'A room you co-inhabit with the agent.',
    captureVerb: 'Pin',
    artifactNoun: 'pinning',
    sessionNoun: 'room',
    agentPresenceLabel: 'The agent is in the room',
  },
}

export function resolveExperience(
  setting: ExperienceMode,
  sessions: Session[],
  artifacts: Artifact[],
): ResolvedExperienceMode {
  if (setting !== 'adaptive') return setting
  if (artifacts.length < 3) return 'observatory'

  const highPriorityRatio =
    artifacts.filter((artifact) => artifact.priority === 'high').length /
    Math.max(1, artifacts.length)
  const activeSessions = sessions.filter((session) => session.status === 'active').length

  if (highPriorityRatio > 0.22) return 'workbench'
  if (activeSessions >= 5 && artifacts.length >= 20) return 'daily_edition'
  if (artifacts.length >= 40) return 'field_journal'
  if (highPriorityRatio < 0.08 && artifacts.length >= 12) return 'quiet_atrium'

  return 'observatory'
}
