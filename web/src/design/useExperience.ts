import { useMemo } from 'react'

import { resolveExperience, type ResolvedExperienceMode } from './experience'
import { useAppStore } from '../store/useAppStore'
import { useSettings } from '../store/useSettings'

export function useResolvedExperience(): ResolvedExperienceMode {
  const setting = useSettings((state) => state.experience)
  const sessions = useAppStore((state) => state.sessions)
  const artifacts = useAppStore((state) => state.artifacts)
  const profileArtifactTotal = useAppStore(
    (state) => state.profile?.stats.artifacts,
  )

  return useMemo(
    () => resolveExperience(setting, sessions, artifacts, profileArtifactTotal),
    [setting, sessions, artifacts, profileArtifactTotal],
  )
}
