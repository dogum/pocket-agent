import type { JSX } from 'react'

import { ArtifactCard } from '../../components/artifact/ArtifactRenderer'
import { deriveSessionIdentity } from '../../design/visualIdentity'
import {
  ActiveRunPresence,
  EmptyHome,
  RunErrorCard,
  activeSessionFor,
} from './HomeCommon'
import type { HomeSurfaceProps } from './types'

export function ObservatoryHome(props: HomeSurfaceProps): JSX.Element {
  const activeSession = activeSessionFor(props.sessions)
  const identity = activeSession ? deriveSessionIdentity(activeSession) : null

  return (
    <div className="screen enter experience-home observatory-home" data-screen-label="01 Feed">
      <div className="briefing rise">
        {activeSession && (
          <div className="t-tag" style={{ marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="home-signal-dot" />
              {activeSession.name}
              {activeSession.description && ` · ${activeSession.description}`}
            </span>
          </div>
        )}
        {identity && (
          <div className="constellation-strip" aria-hidden="true">
            {identity.constellationPoints.map((point, index) => (
              <span
                key={index}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            ))}
          </div>
        )}
        {props.briefing ? (
          <>
            <h1
              className="t-headline greeting"
              dangerouslySetInnerHTML={{ __html: props.briefing.greeting_html }}
            />
            <p className="summary">{props.briefing.summary}</p>
          </>
        ) : (
          <>
            <h1 className="t-headline greeting">
              Pocket <em>Agent</em>
            </h1>
            <p className="summary">
              Send anything — text, files, links. Your agent processes it
              autonomously and surfaces what matters here.
            </p>
          </>
        )}
      </div>

      <ActiveRunPresence {...props} active={props.activeRun} />
      <RunErrorCard message={props.activeRun ? null : props.lastRunError} />

      <div className="card-stack rise" style={{ marginTop: 4 }}>
        {props.artifacts.length === 0 ? (
          <EmptyHome />
        ) : (
          props.artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              onTap={() => props.go({ name: 'artifact', id: artifact.id })}
            />
          ))
        )}
      </div>
    </div>
  )
}
