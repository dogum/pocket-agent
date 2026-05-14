import type { JSX } from 'react'

import { deriveArtifactIdentity, deriveSessionIdentity } from '../../design/visualIdentity'
import {
  ActiveRunPresence,
  EmptyHome,
  RunErrorCard,
  activeSessionFor,
  artifactSummary,
  dateLine,
  timeLabel,
} from './HomeCommon'
import type { HomeSurfaceProps } from './types'

export function FieldJournalHome(props: HomeSurfaceProps): JSX.Element {
  const activeSession = activeSessionFor(props.sessions)
  const sessionIdentity = activeSession ? deriveSessionIdentity(activeSession) : null

  return (
    <div className="screen enter experience-home journal-home" data-screen-label="01 Feed">
      <div className="journal-masthead rise">
        <div className="t-tag">Field Journal</div>
        <h1 className="t-headline">{dateLine()}</h1>
        <p>
          {sessionIdentity?.volumeNumber ?? 'vol. 01'} · {props.artifacts.length}{' '}
          entr{props.artifacts.length === 1 ? 'y' : 'ies'}
        </p>
      </div>

      <ActiveRunPresence {...props} active={props.activeRun} />
      <RunErrorCard message={props.activeRun ? null : props.lastRunError} />

      <div className="journal-entry-list rise">
        {props.artifacts.length === 0 ? (
          <EmptyHome
            label="Blank page"
            body="Pour in a note, file, link, or observation. The agent will turn it into the first entry."
          />
        ) : (
          props.artifacts.map((artifact, index) => {
            const identity = deriveArtifactIdentity(artifact, index)
            return (
              <button
                key={artifact.id}
                type="button"
                className={'journal-entry urgency-' + identity.urgencyTone}
                onClick={() => props.go({ name: 'artifact', id: artifact.id })}
              >
                <span className="entry-margin">
                  <span>{timeLabel(artifact.created_at)}</span>
                  <strong>{artifact.header.label}</strong>
                </span>
                <span className="entry-body">
                  <span className="entry-no">{identity.sequenceLabel}</span>
                  <strong>{artifact.header.title}</strong>
                  <small>{artifactSummary(artifact)}</small>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
