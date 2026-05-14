import type { JSX } from 'react'

import { deriveArtifactIdentity } from '../../design/visualIdentity'
import { DetailFrame } from './DetailFrame'
import type { ArtifactDetailSurfaceProps } from './types'

export function JournalArtifactDetail(props: ArtifactDetailSurfaceProps): JSX.Element {
  const identity = deriveArtifactIdentity(props.artifact)
  return (
    <DetailFrame
      mode="journal"
      screenTitle="Entry"
      eyebrow={`${props.artifact.header.timestamp_display} · Field ${identity.sequenceLabel}`}
      meta={
        <>
          <span>{props.session?.name ?? 'Unbound volume'}</span>
          <span>{props.artifact.header.label}</span>
        </>
      }
      props={props}
    />
  )
}
