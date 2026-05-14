import type { JSX } from 'react'

import type { Artifact, Session } from '@shared/index'
import { AgentPresence } from '../../components/shell/AgentPresence'

export function ActiveRunPresence({
  active,
  liveText,
  liveTool,
  queuedCount,
}: {
  active: boolean
  liveText: string
  liveTool: string | null
  queuedCount: number
}): JSX.Element | null {
  if (!active) return null
  return (
    <AgentPresence
      state="thinking"
      detail={liveTool ?? liveText.slice(-60)}
      readout={queuedCount > 0 ? `+${queuedCount} queued` : undefined}
    />
  )
}

export function RunErrorCard({ message }: { message: string | null }): JSX.Element | null {
  if (!message) return null
  return (
    <div className="run-error-card rise">
      <div className="t-tag">Agent run failed</div>
      <div className="t-body-sm">{message}</div>
    </div>
  )
}

export function EmptyHome({
  label = 'Nothing here yet',
  body = 'Tap + to send your first ingest. Photos, files, links, text — the agent figures out what matters and turns it into an artifact.',
}: {
  label?: string
  body?: string
}): JSX.Element {
  return (
    <div className="card bordered empty-home">
      <div className="t-tag">{label}</div>
      <div className="t-body" style={{ color: 'var(--text)' }}>
        {body}
      </div>
    </div>
  )
}

export function activeSessionFor(sessions: Session[]): Session | undefined {
  return sessions.find((session) => session.status === 'active') ?? sessions[0]
}

export function artifactSummary(artifact: Artifact): string {
  return artifact.header.summary ?? artifact.components
    .slice(0, 2)
    .map((component) => component.type)
    .join(' · ')
}

export function dateLine(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function shortDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}
