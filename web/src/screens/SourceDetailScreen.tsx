import { useEffect, useState, type JSX } from 'react'

import type { Observation, Session, Source } from '@shared/index'
import { ScreenHead } from '../components/shell/Shell'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

export function SourceDetailScreen({ id }: { id: string }): JSX.Element {
  const back = useAppStore((s) => s.back)
  const sessions = useAppStore((s) => s.sessions)
  const upsertSource = useAppStore((s) => s.upsertSource)
  const removeSource = useAppStore((s) => s.removeSource)
  const source = useAppStore((s) => s.sources.find((x) => x.id === id))

  const [observations, setObservations] = useState<Observation[]>([])
  const [attached, setAttached] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Local editable copy of label / description for the inline editor.
  const [label, setLabel] = useState(source?.label ?? '')
  const [description, setDescription] = useState(source?.description ?? '')

  useEffect(() => {
    if (!source) return
    setLabel(source.label)
    setDescription(source.description ?? '')
  }, [source?.id, source?.label, source?.description])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const fetchAll = async (): Promise<void> => {
      const [obs, ...attachState] = await Promise.all([
        api.listObservations(id, 80).catch(() => ({ observations: [] })),
        // For each session, ask which sources it has, and check membership.
        ...sessions.map((s) =>
          api
            .sourcesForSession(s.id)
            .then((res) => ({
              sessionId: s.id,
              attached: res.sources.some((src) => src.id === id),
            }))
            .catch(() => ({ sessionId: s.id, attached: false })),
        ),
      ])
      if (cancelled) return
      setObservations(obs.observations)
      const next = new Set<string>()
      for (const a of attachState as Array<{
        sessionId: string
        attached: boolean
      }>) {
        if (a.attached) next.add(a.sessionId)
      }
      setAttached(next)
      setLoading(false)
    }
    void fetchAll()
    // Poll for new observations every 10s — Sources tend to tick slowly
    // and the SSE event is fired-and-forget, so periodic re-fetch is the
    // safest bet for now without rearchitecting the strip.
    const interval = setInterval(() => {
      api
        .listObservations(id, 80)
        .then((res) => {
          if (!cancelled) setObservations(res.observations)
        })
        .catch(() => {})
    }, 10_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [id, sessions])

  if (!source) {
    return (
      <div className="screen enter">
        <ScreenHead onBack={back} title="Source" />
        <div className="briefing">
          <div className="t-body-sm">Source not found.</div>
        </div>
      </div>
    )
  }

  const toggleEnabled = async (): Promise<void> => {
    setBusy(true)
    try {
      const updated = await api.updateSource(source.id, {
        enabled: !source.enabled,
      })
      upsertSource(updated)
    } finally {
      setBusy(false)
    }
  }

  const saveLabel = async (): Promise<void> => {
    if (label === source.label && description === (source.description ?? ''))
      return
    setBusy(true)
    try {
      const updated = await api.updateSource(source.id, {
        label: label.trim() || source.label,
        description: description.trim() || undefined,
      })
      upsertSource(updated)
    } finally {
      setBusy(false)
    }
  }

  const toggleAttach = async (sessionId: string): Promise<void> => {
    const isAttached = attached.has(sessionId)
    const next = new Set(attached)
    if (isAttached) next.delete(sessionId)
    else next.add(sessionId)
    setAttached(next)
    try {
      if (isAttached) await api.detachSource(sessionId, source.id)
      else await api.attachSource(sessionId, source.id)
    } catch {
      // revert on failure
      setAttached(attached)
    }
  }

  const remove = async (): Promise<void> => {
    if (!confirm(`Delete "${source.label}"? Observations and attachments will be removed.`))
      return
    setBusy(true)
    try {
      await api.deleteSource(source.id)
      removeSource(source.id)
      back()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen enter" data-screen-label="12 Source Detail">
      <ScreenHead onBack={back} title="Source" />
      <div
        style={{ padding: '0 var(--screen-pad) var(--space-lg)' }}
        className="rise"
      >
        <div className="t-tag" style={{ color: 'var(--text-3)' }}>
          {source.name} · {source.kind}
        </div>
        <h1
          className="t-headline"
          style={{ marginTop: 6, marginBottom: 10 }}
        >
          {source.label}
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <span
            className={'status-chip ' + source.status}
            title={source.last_error}
          >
            {source.status}
          </span>
          <span
            onClick={toggleEnabled}
            className={
              'toggle-pill' +
              (source.enabled ? ' on' : ' off') +
              (busy ? ' busy' : '')
            }
            role="switch"
            aria-checked={source.enabled}
          >
            <span className="knob" />
          </span>
          <span
            className="t-tag"
            style={{ color: 'var(--text-3)' }}
          >
            {source.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {source.last_error && (
          <div
            className="card"
            style={{
              padding: '10px 12px',
              marginBottom: 16,
              borderLeft: '2px solid var(--red)',
              background: 'rgba(196,84,84,0.06)',
            }}
          >
            <div
              className="t-tag"
              style={{ color: 'var(--red)', marginBottom: 4 }}
            >
              LAST ERROR
            </div>
            <div className="t-body-sm">{source.last_error}</div>
          </div>
        )}

        {/* Edit label + description inline */}
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <label className="form-field" style={{ marginBottom: 10 }}>
            <span>Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
            />
          </label>
          <label className="form-field">
            <span>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveLabel}
            />
          </label>
        </div>

        {/* Attach to sessions */}
        <div style={{ marginBottom: 18 }}>
          <div className="t-tag" style={{ marginBottom: 8 }}>
            ATTACHED SESSIONS
          </div>
          {sessions.length === 0 && (
            <p
              className="t-body-sm"
              style={{ color: 'var(--text-3)' }}
            >
              No sessions yet — create one and you can attach this source.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="card tap"
                onClick={() => toggleAttach(s.id)}
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'left',
                }}
              >
                <span className="t-body-sm">{s.name}</span>
                <span
                  className={
                    'toggle-pill' + (attached.has(s.id) ? ' on' : ' off')
                  }
                >
                  <span className="knob" />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Observations */}
        <div style={{ marginBottom: 18 }}>
          <div
            className="t-tag"
            style={{
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>RECENT OBSERVATIONS</span>
            <span style={{ color: 'var(--text-3)' }}>
              {observations.length} of {source.ring_buffer_size}
            </span>
          </div>
          {loading && (
            <div
              className="shimmer"
              style={{ height: 60, borderRadius: 8 }}
            />
          )}
          {!loading && observations.length === 0 && (
            <p className="t-body-sm" style={{ color: 'var(--text-3)' }}>
              No observations yet — enable the source and they'll show up
              here as they arrive.
            </p>
          )}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {observations.map((o) => (
              <div key={o.id} className="obs-row">
                <span className="at">{relative(o.observed_at)}</span>
                <span className="summary">{o.summary}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn outline"
          onClick={remove}
          disabled={busy}
          style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
        >
          Delete source
        </button>
      </div>
    </div>
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

// Silence unused import warning in some lints.
export type _SessionRef = Session
