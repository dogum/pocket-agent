import { useMemo } from 'react'

import { resolveExperience, type ResolvedExperienceMode } from './experience'
import { useAppStore } from '../store/useAppStore'
import { useSettings } from '../store/useSettings'

export function useResolvedExperience(): ResolvedExperienceMode {
  const setting = useSettings((state) => state.experience)
  const sessions = useAppStore((state) => state.sessions)
  const artifacts = useAppStore((state) => state.artifacts)

  return useMemo(
    () => resolveExperience(setting, sessions, artifacts),
    [setting, sessions, artifacts],
  )
}
