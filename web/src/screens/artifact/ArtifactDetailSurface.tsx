import type { JSX } from 'react'

import { useResolvedExperience } from '../../design/useExperience'
import { AtriumArtifactDetail } from './AtriumArtifactDetail'
import { EditionArtifactDetail } from './EditionArtifactDetail'
import { JournalArtifactDetail } from './JournalArtifactDetail'
import { ObservatoryArtifactDetail } from './ObservatoryArtifactDetail'
import { WorkbenchArtifactDetail } from './WorkbenchArtifactDetail'
import type { ArtifactDetailSurfaceProps } from './types'

export function ArtifactDetailSurface(
  props: ArtifactDetailSurfaceProps,
): JSX.Element {
  const experience = useResolvedExperience()

  switch (experience) {
    case 'field_journal':
      return <JournalArtifactDetail {...props} />
    case 'daily_edition':
      return <EditionArtifactDetail {...props} />
    case 'workbench':
      return <WorkbenchArtifactDetail {...props} />
    case 'quiet_atrium':
      return <AtriumArtifactDetail {...props} />
    case 'observatory':
    default:
      return <ObservatoryArtifactDetail {...props} />
  }
}
