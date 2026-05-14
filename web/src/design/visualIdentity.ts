import type { Artifact, Session } from '@shared/index'

export interface SessionVisualIdentity {
  seed: number
  accentIndex: number
  rotation: number
  constellationPoints: Array<{ x: number; y: number }>
  volumeNumber: string
  roomTone: 'quiet' | 'active' | 'flagged'
}

export interface ArtifactVisualIdentity {
  seed: number
  sequenceLabel: string
  catalogLabel: string
  jobLabel: string
  pageLabel: string
  pinRotation: number
  urgencyTone: 'quiet' | 'normal' | 'flagged'
}

export function identityFromString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function deriveArtifactIdentity(
  artifact: Artifact,
  index = 0,
): ArtifactVisualIdentity {
  const seed = identityFromString(`${artifact.id}:${artifact.session_id}`)
  const n = index + 1
  const urgencyTone =
    artifact.priority === 'high'
      ? 'flagged'
      : artifact.priority === 'low'
        ? 'quiet'
        : 'normal'

  return {
    seed,
    sequenceLabel: String(n).padStart(2, '0'),
    catalogLabel: `OBS-${String(n).padStart(3, '0')}`,
    jobLabel: `JOB #${String(n).padStart(3, '0')}`,
    pageLabel: n <= 1 ? 'A1' : `A${Math.min(9, n)}`,
    pinRotation: ((seed % 900) / 100) - 4.5,
    urgencyTone,
  }
}

export function deriveSessionIdentity(session: Session): SessionVisualIdentity {
  const seed = identityFromString(session.id)
  const pointCount = 4 + (seed % 4)
  const constellationPoints = Array.from({ length: pointCount }, (_, i) => ({
    x: 12 + ((seed >> (i % 8)) % 76),
    y: 12 + ((seed >> ((i + 3) % 8)) % 76),
  }))

  return {
    seed,
    accentIndex: seed % 6,
    rotation: ((seed % 800) / 100) - 4,
    constellationPoints,
    volumeNumber: `vol. ${String((seed % 9) + 1).padStart(2, '0')}`,
    roomTone:
      session.run_status === 'error'
        ? 'flagged'
        : session.status === 'active'
          ? 'active'
          : 'quiet',
  }
}
