import type { JSX } from 'react'

import { deriveArtifactIdentity } from '../../design/visualIdentity'
import { DetailFrame } from './DetailFrame'
import type { ArtifactDetailSurfaceProps } from './types'

export function EditionArtifactDetail(props: ArtifactDetailSurfaceProps): JSX.Element {
  const identity = deriveArtifactIdentity(props.artifact)
  return (
    <DetailFrame
      mode="edition"
      screenTitle={identity.pageLabel}
      eyebrow={`${identity.pageLabel} · ${props.artifact.header.label}`}
      meta={
        <>
          <span>By the agent</span>
          <span>{props.artifact.header.timestamp_display}</span>
          {props.session && <span>Beat: {props.session.name}</span>}
        </>
      }
      props={props}
    />
  )
}
