import type { JSX } from 'react'

import { deriveArtifactIdentity } from '../../design/visualIdentity'
import {
  ActiveRunPresence,
  EmptyHome,
  RunErrorCard,
  artifactSummary,
} from './HomeCommon'
import type { HomeSurfaceProps } from './types'

export function QuietAtriumHome(props: HomeSurfaceProps): JSX.Element {
  const visible = props.artifacts.slice(0, 10)
  const olderCount = Math.max(0, props.artifacts.length - visible.length)

  return (
    <div className="screen enter experience-home atrium-home" data-screen-label="01 Feed">
      <div className="atrium-header rise">
        <div className="t-tag">Quiet Atrium</div>
        <h1 className="t-headline">Pinned in the room</h1>
        <p>{props.artifacts.length} remembered piece{props.artifacts.length === 1 ? '' : 's'}</p>
      </div>

      <ActiveRunPresence {...props} active={props.activeRun} />
      <RunErrorCard message={props.activeRun ? null : props.lastRunError} />

      {visible.length === 0 ? (
        <EmptyHome
          label="Empty wall"
          body="Pin something to the room. The agent will place the first useful note here."
        />
      ) : (
        <div className="atrium-wall rise">
          {visible.map((artifact, index) => {
            const identity = deriveArtifactIdentity(artifact, index)
            return (
              <button
                key={artifact.id}
                type="button"
                className={'atrium-pin urgency-' + identity.urgencyTone}
                style={{ transform: `rotate(${identity.pinRotation}deg)` }}
                onClick={() => props.go({ name: 'artifact', id: artifact.id })}
              >
                <span className="pin-head" />
                <span>{artifact.header.label}</span>
                <strong>{artifact.header.title}</strong>
                <small>{artifactSummary(artifact)}</small>
              </button>
            )
          })}
          {olderCount > 0 && (
            <div className="atrium-older">+{olderCount} older pinnings</div>
          )}
        </div>
      )}
    </div>
  )
}
