import type { JSX } from 'react'

import { deriveArtifactIdentity } from '../../design/visualIdentity'
import {
  ActiveRunPresence,
  EmptyHome,
  RunErrorCard,
  artifactSummary,
  shortDate,
} from './HomeCommon'
import type { HomeSurfaceProps } from './types'

export function DailyEditionHome(props: HomeSurfaceProps): JSX.Element {
  const hero =
    props.artifacts.find((artifact) => artifact.priority === 'high') ??
    props.artifacts[0]
  const secondary = props.artifacts.filter((artifact) => artifact.id !== hero?.id).slice(0, 4)

  return (
    <div className="screen enter experience-home edition-home" data-screen-label="01 Feed">
      <div className="edition-masthead rise">
        <div className="issue-line">{shortDate()} · Vol III · No {props.artifacts.length + 1}</div>
        <h1>Pocket Agent</h1>
        <p>Dispatches from your active beats</p>
      </div>

      <ActiveRunPresence {...props} active={props.activeRun} />
      <RunErrorCard message={props.activeRun ? null : props.lastRunError} />

      {hero ? (
        <div className="edition-front rise">
          <button
            type="button"
            className="lead-story"
            onClick={() => props.go({ name: 'artifact', id: hero.id })}
          >
            <span className="story-kicker">
              {hero.priority === 'high' ? 'Breaking' : hero.header.label}
            </span>
            <h2>{hero.header.title}</h2>
            <p>{artifactSummary(hero)}</p>
          </button>
          <div className="secondary-stories">
            {secondary.map((artifact, index) => {
              const identity = deriveArtifactIdentity(artifact, index + 1)
              return (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => props.go({ name: 'artifact', id: artifact.id })}
                >
                  <span>{identity.pageLabel} · {artifact.header.label}</span>
                  <strong>{artifact.header.title}</strong>
                </button>
              )
            })}
          </div>
          <div className="wire-line">
            {props.artifacts.slice(0, 5).map((artifact) => artifact.header.label).join(' · ')}
          </div>
        </div>
      ) : (
        <EmptyHome
          label="No edition filed"
          body="File an ingest to the wire. The agent will decide what deserves the front page."
        />
      )}
    </div>
  )
}
