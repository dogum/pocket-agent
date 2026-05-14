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
  index?: number,
): ArtifactVisualIdentity {
  // Labels split by intent:
  //   - catalogLabel (OBS-###) and jobLabel (JOB ####) are *stable IDs* —
  //     hash-derived from the artifact, independent of where it sits in
  //     any list. Prepending a new artifact must NOT renumber existing
  //     ones; users will reference these in follow-up messages.
  //   - pageLabel (A1/A2/…) and sequenceLabel (01/02/…) are *positional*
  //     by design when a list index is provided (Edition: A1 hero,
  //     A2–A5 secondary; Journal: entries 47, 48, 49). When index is
  //     omitted (detail screens), fall back to a stable, seed-derived
  //     value so detail headers stop reading "A1 / 01 / OBS-001" for
  //     every artifact.
  const seed = identityFromString(`${artifact.id}:${artifact.session_id}`)
  const stableId = (seed % 999) + 1 // 1..999, stable per artifact
  const positional = index !== undefined ? index + 1 : null
  const urgencyTone =
    artifact.priority === 'high'
      ? 'flagged'
      : artifact.priority === 'low'
        ? 'quiet'
        : 'normal'

  const sequenceN = positional ?? ((seed % 99) + 1)
  const pageN = positional ?? ((seed % 9) + 1)

  return {
    seed,
    sequenceLabel: String(sequenceN).padStart(2, '0'),
    catalogLabel: `OBS-${String(stableId).padStart(3, '0')}`,
    jobLabel: `JOB #${String(stableId).padStart(3, '0')}`,
    pageLabel: pageN <= 1 ? 'A1' : `A${Math.min(9, pageN)}`,
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
