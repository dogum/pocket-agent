// Feed — the home screen. Briefing header, scan bar, artifact stack.
// Empty state when there are no artifacts yet (post-onboarding, pre-first-ingest).

import type { JSX } from 'react'

import { ArtifactCard } from '../components/artifact/ArtifactRenderer'
import { ScanBar } from '../components/shell/Shell'
import { useAppStore } from '../store/useAppStore'

export function FeedScreen(): JSX.Element {
  const briefing = useAppStore((s) => s.briefing)
  const artifacts = useAppStore((s) => s.artifacts)
  const sessions = useAppStore((s) => s.sessions)
  const activeRun = useAppStore((s) => s.activeRunId !== null)
  const liveText = useAppStore((s) => s.liveText)
  const liveTool = useAppStore((s) => s.liveTool)
  const lastRunError = useAppStore((s) => s.lastRunError)
  const queuedCount = useAppStore((s) => s.queuedRuns.length)
  const go = useAppStore((s) => s.go)

  const activeSession = sessions.find((s) => s.status === 'active') ?? sessions[0]

  return (
    <div className="screen enter" data-screen-label="01 Feed">
      <div className="briefing rise">
        {activeSession && (
          <div className="t-tag" style={{ marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--signal)',
                  boxShadow: '0 0 8px var(--signal)',
                }}
              />
              {activeSession.name}
              {activeSession.description && ` · ${activeSession.description}`}
            </span>
          </div>
        )}
        {briefing ? (
          <>
            <h1
              className="t-headline greeting"
              dangerouslySetInnerHTML={{ __html: briefing.greeting_html }}
            />
            <p className="summary">{briefing.summary}</p>
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

      {activeRun && (
        <ScanBar
          state="thinking"
          text="Agent is working"
          detail={liveTool ?? liveText.slice(-60)}
          readout={queuedCount > 0 ? `+${queuedCount} queued` : undefined}
        />
      )}

      {lastRunError && !activeRun && (
        <div className="run-error-card rise">
          <div className="t-tag">Agent run failed</div>
          <div className="t-body-sm">{lastRunError}</div>
        </div>
      )}

      <div className="card-stack rise" style={{ marginTop: 4 }}>
        {artifacts.length === 0 ? (
          <EmptyFeed />
        ) : (
          artifacts.map((a) => (
            <ArtifactCard
              key={a.id}
              artifact={a}
              onTap={() => go({ name: 'artifact', id: a.id })}
            />
          ))
        )}
      </div>
    </div>
  )
}

function EmptyFeed(): JSX.Element {
  return (
    <div
      className="card bordered"
      style={{
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <div className="t-tag">Nothing here yet</div>
      <div className="t-body" style={{ color: 'var(--text)' }}>
        Tap <strong>+</strong> to send your first ingest. Photos, files, links,
        text — the agent figures out what matters and turns it into an artifact.
      </div>
    </div>
  )
}
