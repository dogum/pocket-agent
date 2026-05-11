import { useEffect, useState, type JSX } from 'react'

import type { Source, SourceConfig, SourceKind } from '@shared/index'
import { ScreenHead } from '../components/shell/Shell'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

const KIND_LABEL: Record<SourceKind, string> = {
  demo: 'Demo',
  mcp: 'MCP server',
  webhook: 'Webhook',
  polled_url: 'Polled URL',
}

const STATUS_LABEL: Record<Source['status'], string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  configuring: 'Configuring',
  error: 'Error',
  paused: 'Paused',
}

export function SourcesScreen(): JSX.Element {
  const back = useAppStore((s) => s.back)
  const go = useAppStore((s) => s.go)
  const sources = useAppStore((s) => s.sources)
  const setData = useAppStore((s) => s.setData)
  const upsertSource = useAppStore((s) => s.upsertSource)

  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .listSources()
      .then((res) => {
        if (cancelled) return
        setData({ sources: res.sources })
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [setData])

  const toggleEnabled = async (source: Source): Promise<void> => {
    setBusy(source.id)
    try {
      const updated = await api.updateSource(source.id, {
        enabled: !source.enabled,
      })
      upsertSource(updated)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="screen enter" data-screen-label="11 Sources">
      <ScreenHead onBack={back} title="Sources" />
      <div
        style={{ padding: '0 var(--screen-pad) var(--space-lg)' }}
        className="rise"
      >
        <h1 className="t-headline" style={{ marginBottom: 8 }}>
          Ambient <em>sources</em>
        </h1>
        <p className="t-body-sm" style={{ marginBottom: 18 }}>
          Long-lived feeds the agent watches between your inputs. Attach a
          source to a session and recent observations show up in the
          agent's kickoff context — and reflexes you approve fire
          automatically when a pattern matches.
        </p>

        {loading ? (
          <div className="shimmer" style={{ height: 80, borderRadius: 12 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sources.map((source) => (
              <button
                type="button"
                key={source.id}
                className="card tap"
                onClick={() => go({ name: 'source', id: source.id })}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="t-body" style={{ fontWeight: 500 }}>
                      {source.label}
                    </span>
                    <span
                      className="t-tag"
                      style={{ color: 'var(--text-3)', marginTop: 2 }}
                    >
                      {source.name} · {KIND_LABEL[source.kind]}
                    </span>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      void toggleEnabled(source)
                    }}
                    className={
                      'toggle-pill' +
                      (source.enabled ? ' on' : ' off') +
                      (busy === source.id ? ' busy' : '')
                    }
                    role="switch"
                    aria-checked={source.enabled}
                  >
                    <span className="knob" />
                  </span>
                </div>
                {source.description && (
                  <p className="t-body-sm" style={{ color: 'var(--text-2)' }}>
                    {source.description}
                  </p>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    className={'status-chip ' + source.status}
                    title={source.last_error}
                  >
                    {STATUS_LABEL[source.status]}
                  </span>
                  {source.last_observation_at && (
                    <span
                      className="t-tag"
                      style={{ color: 'var(--text-3)' }}
                    >
                      Last: {relative(source.last_observation_at)}
                    </span>
                  )}
                </div>
              </button>
            ))}
            <button
              type="button"
              className="card tap"
              onClick={() => setShowAdd(true)}
              style={{
                padding: 14,
                color: 'var(--signal)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                letterSpacing: '0.08em',
              }}
            >
              + ADD SOURCE
            </button>
          </div>
        )}
      </div>
      {showAdd && (
        <AddSourceSheet
          onClose={() => setShowAdd(false)}
          onCreated={(source) => {
            upsertSource(source)
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

function AddSourceSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (source: Source) => void
}): JSX.Element {
  const [kind, setKind] = useState<SourceKind>('polled_url')
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [pollSeconds, setPollSeconds] = useState(60)
  const [mcpEndpoint, setMcpEndpoint] = useState('')
  const [webhookPath, setWebhookPath] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (busy) return
    if (!name.trim() || !label.trim()) {
      setErr('name and label are required')
      return
    }
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    let config: SourceConfig
    if (kind === 'polled_url') {
      if (!url.trim()) {
        setErr('URL is required for a polled source')
        return
      }
      config = {
        kind: 'polled_url',
        url: url.trim(),
        poll_seconds: Math.max(30, pollSeconds),
      }
    } else if (kind === 'mcp') {
      if (!mcpEndpoint.trim()) {
        setErr('endpoint is required for an MCP source')
        return
      }
      config = { kind: 'mcp', endpoint: mcpEndpoint.trim() }
    } else if (kind === 'webhook') {
      if (!webhookPath.trim()) {
        setErr('path is required for a webhook source')
        return
      }
      config = { kind: 'webhook', path: webhookPath.trim() }
    } else {
      config = { kind: 'demo', cadence_seconds: 60 }
    }

    setBusy(true)
    setErr(null)
    try {
      const source = await api.createSource({
        name: slug,
        label: label.trim(),
        description: description.trim() || undefined,
        kind,
        config,
        enabled: false,
      })
      onCreated(source)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to create source')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        className="sheet"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="handle" />
        <div
          className="body"
          style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 'var(--screen-pad)' }}
        >
        <h2 className="t-subtitle" style={{ marginBottom: 4 }}>
          New source
        </h2>
        <p className="t-body-sm" style={{ color: 'var(--text-2)' }}>
          Pick the source kind, give it a short slug, and configure where it
          comes from. You can attach it to sessions and toggle it on after
          creating it.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['polled_url', 'mcp', 'webhook', 'demo'] as SourceKind[]).map(
            (k) => (
              <button
                key={k}
                type="button"
                className={'chip' + (kind === k ? ' on' : '')}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ),
          )}
        </div>

        <label className="form-field">
          <span>Slug (lowercase, no spaces)</span>
          <input
            type="text"
            value={name}
            placeholder="e.g. strava_recent"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="form-field">
          <span>Display label</span>
          <input
            type="text"
            value={label}
            placeholder="e.g. Strava recent runs"
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>

        <label className="form-field">
          <span>Description (optional)</span>
          <input
            type="text"
            value={description}
            placeholder="What does this watch?"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {kind === 'polled_url' && (
          <>
            <label className="form-field">
              <span>URL</span>
              <input
                type="url"
                value={url}
                placeholder="https://…"
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Poll every (seconds, min 30)</span>
              <input
                type="number"
                min={30}
                value={pollSeconds}
                onChange={(e) =>
                  setPollSeconds(Math.max(30, Number(e.target.value)))
                }
              />
            </label>
          </>
        )}

        {kind === 'mcp' && (
          <label className="form-field">
            <span>MCP endpoint (HTTPS streaming)</span>
            <input
              type="url"
              value={mcpEndpoint}
              placeholder="https://mcp.example.com/streaming"
              onChange={(e) => setMcpEndpoint(e.target.value)}
            />
            <p
              className="t-body-sm"
              style={{ marginTop: 4, color: 'var(--text-3)' }}
            >
              MCP transport ships as a skeleton in this build; the source
              will sit in "configuring" until wired.
            </p>
          </label>
        )}

        {kind === 'webhook' && (
          <label className="form-field">
            <span>Webhook path (relative)</span>
            <input
              type="text"
              value={webhookPath}
              placeholder="e.g. strava"
              onChange={(e) => setWebhookPath(e.target.value)}
            />
          </label>
        )}

        {err && (
          <div className="t-body-sm" style={{ color: 'var(--red)' }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 12 }}>
          <button
            type="button"
            className="btn outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Creating…' : 'Create source'}
          </button>
        </div>
        </div>
      </div>
    </>
  )
}

function relative(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (ms < 60_000) return 'just now'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}
