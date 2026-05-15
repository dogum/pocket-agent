import type { JSX } from 'react'

import type { Session } from '@shared/index'
import { Icon } from '../../components/icons/Icon'
import { deriveSessionIdentity } from '../../design/visualIdentity'
import type { SessionSurfaceVariant, SessionsSurfaceProps } from './types'
import {
  capitalize,
  relativeTime,
  sessionStage,
  sessionStatusLabel,
  sessionStatusTone,
} from './utils'

interface SessionListSurfaceProps extends SessionsSurfaceProps {
  variant: SessionSurfaceVariant
  sessionNoun: string
  pluralNoun: string
  eyebrow: string
  headline: string
  body: string
  createLabel: string
  emptyActiveTitle: string
  emptyArchivedTitle: string
}

export function SessionListSurface({
  variant,
  sessionNoun,
  pluralNoun,
  eyebrow,
  headline,
  body,
  activeSessions,
  archivedSessions,
  showArchived,
  creating,
  name,
  description,
  onShowActive,
  onShowArchived,
  onOpen,
  onMenu,
  onCreateStart,
  onNameChange,
  onDescriptionChange,
  onCreate,
  onCancelCreate,
  createLabel,
  emptyActiveTitle,
  emptyArchivedTitle,
}: SessionListSurfaceProps): JSX.Element {
  const sessions = showArchived ? archivedSessions : activeSessions
  return (
    <div className={`sessions-surface sessions-${variant}`}>
      <section className="sessions-masthead rise">
        <div className="t-tag">{eyebrow}</div>
        <h1 className="t-headline">
          {headline} <em>{pluralNoun}</em>
        </h1>
        <p className="t-body-sm">{body}</p>
        <div className="sessions-tabs" aria-label={`${pluralNoun} filter`}>
          <button
            type="button"
            className={!showArchived ? 'active' : ''}
            onClick={onShowActive}
          >
            Active <span>{activeSessions.length}</span>
          </button>
          <button
            type="button"
            className={showArchived ? 'active' : ''}
            onClick={onShowArchived}
          >
            Archived <span>{archivedSessions.length}</span>
          </button>
        </div>
      </section>

      <section className="sessions-list rise">
        {sessions.map((session) => (
          <SessionCardView
            key={session.id}
            session={session}
            sessionNoun={sessionNoun}
            variant={variant}
            onOpen={() => onOpen(session)}
            onMenu={() => onMenu(session)}
          />
        ))}

        {sessions.length === 0 && (
          <EmptySessionCard
            title={showArchived ? emptyArchivedTitle : emptyActiveTitle}
            body={
              showArchived
                ? `Archived ${pluralNoun} land here.`
                : `Start a ${sessionNoun} when the agent needs a place to keep working.`
            }
          />
        )}

        {!showArchived && (
          <CreateSessionCard
            creating={creating}
            sessionNoun={sessionNoun}
            name={name}
            description={description}
            createLabel={createLabel}
            onCreateStart={onCreateStart}
            onNameChange={onNameChange}
            onDescriptionChange={onDescriptionChange}
            onCreate={onCreate}
            onCancelCreate={onCancelCreate}
          />
        )}
      </section>
    </div>
  )
}

function SessionCardView({
  session,
  sessionNoun,
  variant,
  onOpen,
  onMenu,
}: {
  session: Session
  sessionNoun: string
  variant: SessionSurfaceVariant
  onOpen: () => void
  onMenu: () => void
}): JSX.Element {
  const identity = deriveSessionIdentity(session)
  const tone = sessionStatusTone(session)
  const stage = sessionStage(session)
  // Make the entire card the click target rather than the inner title.
  // Previously only the narrow .session-card-open band was clickable —
  // the spine, status chip row, footer, and ~80% of the card surface
  // were dead zones, so taps that missed the title felt like the card
  // was inert. The menu icon stops propagation so its tap still opens
  // the menu instead of navigating.
  const activate = (): void => onOpen()
  return (
    <article
      className={`session-card-shell session-card-${variant} tone-${identity.roomTone}`}
      data-session-noun={sessionNoun}
      role="button"
      tabIndex={0}
      aria-label={`Open ${sessionNoun} ${session.name}`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activate()
        }
      }}
    >
      <SessionDecoration session={session} variant={variant} />
      <div className="session-card-main">
        <div className="session-card-top">
          <span className={`chip ${tone}`}>
            <span className="session-status-dot" />
            {sessionStatusLabel(session)}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={(event) => {
              event.stopPropagation()
              onMenu()
            }}
            title="More"
          >
            <Icon name="menu" size={14} />
          </button>
        </div>

        <div className="session-card-open">
          <span className="session-card-title">{session.name}</span>
          {session.description && (
            <span className="session-card-description">{session.description}</span>
          )}
        </div>

        {variant === 'workbench' && (
          <div className="session-stage-meter" aria-label={stage.label}>
            {stage.meter.map((label, index) => (
              <span
                key={label}
                className={
                  index < stage.index
                    ? 'done'
                    : index === stage.index
                      ? 'active'
                      : ''
                }
              />
            ))}
            <strong>{stage.label}</strong>
          </div>
        )}

        <div className="session-card-footer">
          <span>{relativeTime(session.updated_at)}</span>
          <span className="session-identity">{identity.volumeNumber}</span>
          <span>
            {session.ingest_count} in · {session.artifact_count} out
          </span>
        </div>
      </div>
    </article>
  )
}

function SessionDecoration({
  session,
  variant,
}: {
  session: Session
  variant: SessionSurfaceVariant
}): JSX.Element {
  const identity = deriveSessionIdentity(session)
  if (variant === 'observatory') {
    return (
      <div className="session-constellation-mini" aria-hidden="true">
        {identity.constellationPoints.map((point, index) => (
          <span
            key={`${point.x}-${point.y}-${index}`}
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
          />
        ))}
      </div>
    )
  }
  if (variant === 'journal') {
    return (
      <div className="session-spine" aria-hidden="true">
        <span>{identity.volumeNumber}</span>
        <strong>{new Date(session.created_at).getFullYear()}</strong>
      </div>
    )
  }
  if (variant === 'edition') {
    return (
      <div className="session-edition-strip" aria-hidden="true">
        <span>Beat desk</span>
        <strong>{session.artifact_count || session.ingest_count}</strong>
      </div>
    )
  }
  if (variant === 'atrium') {
    return (
      <div
        className="session-room-pin"
        style={{ transform: `rotate(${identity.rotation}deg)` }}
        aria-hidden="true"
      >
        <span />
      </div>
    )
  }
  return (
    <div className="session-job-tab" aria-hidden="true">
      <span>{sessionStage(session).label}</span>
    </div>
  )
}

function EmptySessionCard({
  title,
  body,
}: {
  title: string
  body: string
}): JSX.Element {
  return (
    <div className="session-empty-card">
      <div className="t-body-sm">{title}</div>
      <div className="t-caption">{body}</div>
    </div>
  )
}

function CreateSessionCard({
  creating,
  sessionNoun,
  name,
  description,
  createLabel,
  onCreateStart,
  onNameChange,
  onDescriptionChange,
  onCreate,
  onCancelCreate,
}: {
  creating: boolean
  sessionNoun: string
  name: string
  description: string
  createLabel: string
  onCreateStart: () => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreate: () => void
  onCancelCreate: () => void
}): JSX.Element {
  if (!creating) {
    return (
      <button
        type="button"
        onClick={onCreateStart}
        className="session-create-card"
      >
        <Icon name="plus" size={14} />
        <span>{createLabel}</span>
      </button>
    )
  }

  return (
    <div className="session-create-form">
      <input
        autoFocus
        placeholder={`${capitalize(sessionNoun)} name (e.g. Marathon · Berlin)`}
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <input
        placeholder="One-line description (optional)"
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
      />
      <div>
        <button className="btn primary" type="button" onClick={onCreate}>
          Create
        </button>
        <button className="btn outline" type="button" onClick={onCancelCreate}>
          Cancel
        </button>
      </div>
    </div>
  )
}
