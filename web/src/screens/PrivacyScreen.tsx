// Privacy & data — what's local, what's sent to Anthropic, export, clear.

import { useEffect, useState, type JSX } from 'react'

import { Icon } from '../components/icons/Icon'
import { ScreenHead } from '../components/shell/Shell'
import { api, type DataSummary } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function PrivacyScreen(): JSX.Element {
  const back = useAppStore((s) => s.back)
  const setData = useAppStore((s) => s.setData)
  const [summary, setSummary] = useState<DataSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getDataSummary()
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const reload = async (): Promise<void> => {
    try {
      const s = await api.getDataSummary()
      setSummary(s)
    } catch {
      // ignore
    }
  }

  const onExport = (): void => {
    // Browser handles the file download via Content-Disposition.
    window.location.href = api.exportDataUrl
  }

  const onClearAll = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    try {
      await api.clearAllData()
      // Drop everything from the store too — the agent stays.
      setData({ sessions: [], artifacts: [], briefing: null, recentIngests: [] })
      setShowConfirm(false)
      setConfirmInput('')
      setFeedback('All data cleared. Your agent is still configured.')
      await reload()
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen enter" data-screen-label="Privacy">
      <ScreenHead onBack={back} title="Privacy & data" />

      <div style={{ padding: '0 var(--screen-pad)' }} className="rise">
        <div className="t-tag" style={{ marginBottom: 6 }}>Privacy</div>
        <h1 className="t-headline" style={{ marginBottom: 8 }}>
          Your data, <em>visible</em>
        </h1>
        <p className="t-body-sm" style={{ marginBottom: 22 }}>
          Local-first by design. Here's what's stored on this machine,
          what gets sent to Anthropic when the agent runs, and how to
          export or clear everything.
        </p>

        {/* ── What's local ───────────────────────────────────────── */}
        <div className="t-tag" style={{ marginBottom: 8 }}>What's local</div>
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          {summary ? (
            <>
              <div className="c-data-row" style={{ marginBottom: 12 }}>
                <div className="cell">
                  <span className="v signal">{summary.counts.sessions}</span>
                  <span className="l">Sessions</span>
                </div>
                <div className="cell">
                  <span className="v">{summary.counts.ingests}</span>
                  <span className="l">Ingests</span>
                </div>
                <div className="cell">
                  <span className="v cool">{summary.counts.artifacts}</span>
                  <span className="l">Artifacts</span>
                </div>
              </div>
              <div className="t-caption" style={{ marginBottom: 4 }}>
                Database
              </div>
              <div
                className="t-mono t-body-sm"
                style={{ color: 'var(--text-2)', wordBreak: 'break-all' }}
              >
                {summary.paths.db}
              </div>
              <div className="t-caption" style={{ marginTop: 10, marginBottom: 4 }}>
                Upload cache
              </div>
              <div
                className="t-mono t-body-sm"
                style={{ color: 'var(--text-2)', wordBreak: 'break-all' }}
              >
                {summary.paths.upload_cache}{' '}
                <span className="t-caption">
                  · {summary.counts.file_uploads} files ·{' '}
                  {formatBytes(summary.upload_cache_bytes)}
                </span>
              </div>
            </>
          ) : (
            <div className="shimmer" style={{ height: 14, borderRadius: 4 }} />
          )}
        </div>

        {/* ── What's sent to Anthropic ────────────────────────────── */}
        <div className="t-tag" style={{ marginBottom: 8 }}>
          What's sent to Anthropic
        </div>
        <div className="card" style={{ padding: 14, marginBottom: 22 }}>
          <ul
            className="t-body-sm"
            style={{
              color: 'var(--text-2)',
              lineHeight: 1.6,
              paddingLeft: 16,
              listStyle: 'disc',
            }}
          >
            <li>The agent's system prompt (once at bootstrap).</li>
            <li>
              The kickoff message for every ingest — includes the new
              input plus a compact summary of recent session context.
            </li>
            <li>
              File bytes for any photo / file / voice ingest, via the
              Anthropic Files API. Images may be re-attached as visual
              context across turns.
            </li>
          </ul>
          <div
            className="t-caption"
            style={{ marginTop: 10, color: 'var(--text-3)' }}
          >
            No telemetry. No third parties.
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="t-tag" style={{ marginBottom: 8 }}>Actions</div>

        <button
          type="button"
          className="card tap"
          onClick={onExport}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            width: '100%',
            textAlign: 'left',
            marginBottom: 8,
          }}
        >
          <Icon name="export" size={14} />
          <div style={{ flex: 1 }}>
            <div className="t-body-sm" style={{ color: 'var(--text)' }}>
              Export all data
            </div>
            <div className="t-caption">
              Sessions, ingests, artifacts, briefings, profile — as a JSON file
            </div>
          </div>
          <Icon name="chevron-right" size={12} />
        </button>

        {showConfirm ? (
          <div
            className="card"
            style={{
              padding: 14,
              marginBottom: 22,
              border: '1px solid var(--red-dim)',
            }}
          >
            <div
              className="t-body-sm"
              style={{ color: 'var(--red)', marginBottom: 6 }}
            >
              This wipes every session, ingest, and artifact. The
              bootstrapped agent is preserved, so you don't have to
              re-run <code>bootstrap-agent</code>.
            </div>
            <div className="t-caption" style={{ marginBottom: 8 }}>
              Type <code>delete</code> to confirm.
            </div>
            <input
              autoFocus
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="delete"
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--surface-2)',
                borderRadius: 8,
                fontFamily: 'var(--mono)',
                fontSize: 13,
                marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                disabled={confirmInput !== 'delete' || busy}
                onClick={() => void onClearAll()}
                style={{
                  background: 'var(--red)',
                  boxShadow: '0 4px 18px var(--red-dim)',
                }}
              >
                {busy ? 'Clearing…' : 'Clear all data'}
              </button>
              <button
                type="button"
                className="btn outline"
                onClick={() => {
                  setShowConfirm(false)
                  setConfirmInput('')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="card tap"
            onClick={() => setShowConfirm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              width: '100%',
              textAlign: 'left',
              marginBottom: 22,
              color: 'var(--red)',
            }}
          >
            <Icon name="archive" size={14} />
            <div style={{ flex: 1 }}>
              <div className="t-body-sm" style={{ color: 'var(--red)' }}>
                Clear all data
              </div>
              <div className="t-caption">
                Wipe everything except the agent configuration
              </div>
            </div>
            <Icon name="chevron-right" size={12} />
          </button>
        )}

        {feedback && (
          <div
            className="t-body-sm"
            style={{
              color: 'var(--text-2)',
              padding: '10px 14px',
              background: 'var(--surface-1)',
              borderRadius: 10,
              marginBottom: 22,
            }}
          >
            {feedback}
          </div>
        )}
      </div>
    </div>
  )
}
