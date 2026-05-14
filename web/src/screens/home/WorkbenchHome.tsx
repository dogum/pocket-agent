import type { JSX } from 'react'

import type { Artifact } from '@shared/index'
import { deriveArtifactIdentity } from '../../design/visualIdentity'
import {
  ActiveRunPresence,
  EmptyHome,
  RunErrorCard,
  artifactSummary,
} from './HomeCommon'
import type { HomeSurfaceProps } from './types'

type WorkState = 'awaiting' | 'drafting' | 'on_deck'

export function WorkbenchHome(props: HomeSurfaceProps): JSX.Element {
  const grouped: Record<WorkState, Artifact[]> = {
    awaiting: [],
    drafting: [],
    on_deck: [],
  }
  for (const artifact of props.artifacts) {
    grouped[deriveWorkState(artifact)].push(artifact)
  }

  return (
    <div className="screen enter experience-home workbench-home" data-screen-label="01 Feed">
      <div className="bench-header rise">
        <div className="t-tag">The Workbench</div>
        <h1 className="t-headline">Pieces on the bench</h1>
        <div className="bench-counts">
          <span>{grouped.awaiting.length} awaiting</span>
          <span>{grouped.drafting.length} drafting</span>
          <span>{grouped.on_deck.length} on deck</span>
        </div>
      </div>

      <ActiveRunPresence {...props} active={props.activeRun} />
      <RunErrorCard message={props.activeRun ? null : props.lastRunError} />

      {props.artifacts.length === 0 ? (
        <EmptyHome
          label="Bench is clear"
          body="Dispatch a prompt, file, or link. The agent will place the resulting workpiece here."
        />
      ) : (
        <div className="work-zones rise">
          <WorkZone title="Awaiting sign-off" state="awaiting" items={grouped.awaiting} go={props.go} />
          <WorkZone title="On the spindle" state="drafting" items={grouped.drafting} go={props.go} />
          <WorkZone title="On deck" state="on_deck" items={grouped.on_deck} go={props.go} />
        </div>
      )}
    </div>
  )
}

function WorkZone({
  title,
  state,
  items,
  go,
}: {
  title: string
  state: WorkState
  items: Artifact[]
  go: HomeSurfaceProps['go']
}): JSX.Element {
  return (
    <section className={'work-zone zone-' + state}>
      <div className="zone-title">{title}</div>
      {items.length === 0 ? (
        <div className="zone-empty">No workpieces</div>
      ) : (
        items.map((artifact, index) => {
          const identity = deriveArtifactIdentity(artifact, index)
          return (
            <button
              key={artifact.id}
              type="button"
              className={'workpiece urgency-' + identity.urgencyTone}
              onClick={() => go({ name: 'artifact', id: artifact.id })}
            >
              <span>{identity.jobLabel}</span>
              <strong>{artifact.header.title}</strong>
              <small>{artifactSummary(artifact)}</small>
            </button>
          )
        })
      )}
    </section>
  )
}

function deriveWorkState(artifact: Artifact): WorkState {
  if (artifact.components.some((component) => component.type === 'question_set')) {
    return 'awaiting'
  }
  if (artifact.priority === 'high') return 'awaiting'
  if (artifact.header.label.toLowerCase().includes('draft')) return 'drafting'
  return 'on_deck'
}
