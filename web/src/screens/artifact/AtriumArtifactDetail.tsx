import type { JSX } from 'react'

import { DetailFrame } from './DetailFrame'
import type { ArtifactDetailSurfaceProps } from './types'

export function AtriumArtifactDetail(props: ArtifactDetailSurfaceProps): JSX.Element {
  return (
    <DetailFrame
      mode="atrium"
      screenTitle="Pinned"
      eyebrow={`Picked up from ${props.session?.name ?? 'the room'}`}
      meta={
        <>
          <span>{props.artifact.header.label}</span>
          <span>{props.artifact.header.timestamp_display}</span>
        </>
      }
      props={props}
    />
  )
}
