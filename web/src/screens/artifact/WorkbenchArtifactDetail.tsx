import type { JSX } from 'react'

import { deriveArtifactIdentity } from '../../design/visualIdentity'
import { DetailFrame } from './DetailFrame'
import type { ArtifactDetailSurfaceProps } from './types'

export function WorkbenchArtifactDetail(
  props: ArtifactDetailSurfaceProps,
): JSX.Element {
  const identity = deriveArtifactIdentity(props.artifact)
  const stage = deriveWorkbenchStage(props)
  const stages = ['Intake', 'Draft', 'Review', 'Ship']
  return (
    <DetailFrame
      mode="workbench"
      screenTitle={identity.jobLabel}
      eyebrow={`${identity.jobLabel} · ${props.artifact.header.label}`}
      meta={
        <>
          <span>{stage.status}</span>
          <span>Stage {String(stage.activeIndex + 1).padStart(2, '0')} / 04</span>
          {props.session && <span>Project: {props.session.name}</span>}
        </>
      }
      props={props}
    >
      <div className="stage-rail" aria-hidden="true">
        {stages.map((label, index) => (
          <span
            key={label}
            className={
              index < stage.activeIndex
                ? 'done'
                : index === stage.activeIndex
                  ? 'active'
                  : ''
            }
          >
            {label}
          </span>
        ))}
      </div>
    </DetailFrame>
  )
}

function deriveWorkbenchStage({
  artifact,
}: ArtifactDetailSurfaceProps): { activeIndex: number; status: string } {
  const hasQuestion = artifact.components.some((component) => component.type === 'question_set')
  const hasChecklist = artifact.components.some((component) => component.type === 'checklist')
  const label = artifact.header.label.toLowerCase()

  if (hasQuestion || artifact.priority === 'high') {
    return { activeIndex: 2, status: 'Awaiting sign-off' }
  }
  if (label.includes('draft') || artifact.components.some((component) => component.type === 'draft_review')) {
    return { activeIndex: 1, status: 'Drafting' }
  }
  if (hasChecklist || artifact.actions?.some((action) => action.action === 'confirm')) {
    return { activeIndex: 2, status: 'Ready for review' }
  }
  // "On deck" = queued, hasn't started. Maps to Intake (activeIndex 0)
  // so the rail and meta line agree — otherwise activeIndex 3 lit up
  // Ship and marked Intake/Draft/Review done while the text said the
  // workpiece was still on deck.
  return { activeIndex: 0, status: 'On deck' }
}
