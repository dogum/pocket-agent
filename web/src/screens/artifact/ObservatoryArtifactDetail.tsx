import type { JSX } from 'react'

import { deriveArtifactIdentity } from '../../design/visualIdentity'
import { DetailFrame } from './DetailFrame'
import type { ArtifactDetailSurfaceProps } from './types'

export function ObservatoryArtifactDetail(
  props: ArtifactDetailSurfaceProps,
): JSX.Element {
  const identity = deriveArtifactIdentity(props.artifact)
  return (
    <DetailFrame
      mode="observatory"
      screenTitle={props.artifact.header.label}
      eyebrow={`${props.artifact.header.label} · ${identity.catalogLabel}`}
      meta={
        <>
          <span>{props.artifact.header.timestamp_display}</span>
          <span>Priority {props.artifact.priority}</span>
          {props.session && <span>Station {props.session.name}</span>}
        </>
      }
      props={props}
    />
  )
}
