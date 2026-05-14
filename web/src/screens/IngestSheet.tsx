import { useRef, useState, type JSX } from 'react'

import type { IngestType } from '@shared/index'
import { Icon } from '../components/icons/Icon'
import { EXPERIENCES } from '../design/experience'
import { useResolvedExperience } from '../design/useExperience'
import { useRunDispatcher } from '../hooks/useRunDispatcher'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

export function IngestSheet(): JSX.Element | null {
  const showIngest = useAppStore((s) => s.showIngest)
  const setShowIngest = useAppStore((s) => s.setShowIngest)
  const sessions = useAppStore((s) => s.sessions)
  const activeRunId = useAppStore((s) => s.activeRunId)
  const queuedCount = useAppStore((s) => s.queuedRuns.length)
  const experience = useResolvedExperience()
  const definition = EXPERIENCES[experience]
  const { dispatch } = useRunDispatcher()

  const [text, setText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Synchronous lock — React state isn't fast enough to defeat double-clicks.
  const submittingRef = useRef(false)

  if (!showIngest) return null

  const close = (): void => {
    setText('')
    setFiles([])
    setError(null)
    setShowIngest(false)
  }

  const resolveTarget = (): string | null =>
    sessionId ??
    sessions.find((s) => s.status === 'active')?.id ??
    sessions[0]?.id ??
    null

  const submit = async (): Promise<void> => {
    if (submittingRef.current) return
    setError(null)
    const targetSessionId = resolveTarget()
    if (!targetSessionId) {
      setError('Create a session first (Sessions tab → +).')
      return
    }

    const trimmedText = text.trim()
    if (!trimmedText && files.length === 0) {
      setError('Type something or attach a file.')
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      // Files first — each upload becomes its own ingest.
      for (const file of files) {
        const ingest = await api.uploadIngest({
          session_id: targetSessionId,
          file,
        })
        void dispatch(targetSessionId, ingest.id)
      }

      // Text/link ingest, if any text was provided.
      if (trimmedText) {
        const isLink = /^https?:\/\//i.test(trimmedText)
        const type: IngestType = isLink ? 'link' : 'text'
        const ingest = await api.createIngest({
          session_id: targetSessionId,
          type,
          raw_text: trimmedText,
          metadata: isLink ? { url: trimmedText } : undefined,
        })
        void dispatch(targetSessionId, ingest.id)
      }
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length > 0) setFiles((f) => [...f, ...picked])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (idx: number): void =>
    setFiles((f) => f.filter((_, i) => i !== idx))

  return (
    <>
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet">
        <div className="handle" />
        <div className="body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 14,
            }}
          >
            <div className="t-tag">{definition.captureVerb} to agent</div>
            <button className="icon-btn" onClick={close} type="button">
              <Icon name="close" size={14} />
            </button>
          </div>

          {activeRunId && (
            <div
              className="card"
              style={{
                padding: '10px 14px',
                marginBottom: 12,
                background: 'var(--signal-dim)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--signal)',
                  boxShadow: '0 0 8px var(--signal)',
                }}
              />
              <div style={{ flex: 1 }}>
                <div className="t-body-sm" style={{ color: 'var(--signal)' }}>
                  {definition.agentPresenceLabel}
                  {queuedCount > 0 && ` · ${queuedCount} queued`}
                </div>
                <div className="t-caption">
                  Your message will run as soon as it finishes.
                </div>
              </div>
            </div>
          )}

          <textarea
            placeholder={capturePlaceholder(experience)}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              padding: 12,
              background: 'var(--surface-2)',
              borderRadius: 12,
              fontSize: 14,
              fontFamily: 'var(--sans)',
              color: 'var(--text)',
              resize: 'none',
            }}
          />

          {files.length > 0 && (
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {files.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                  }}
                >
                  <Icon
                    name={
                      f.type.startsWith('image/')
                        ? 'photo'
                        : f.type.startsWith('audio/')
                          ? 'mic'
                          : 'file'
                    }
                    size={14}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="t-body-sm"
                      style={{
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {f.name}
                    </div>
                    <div className="t-caption">{formatBytes(f.size)}</div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeFile(i)}
                    style={{ width: 24, height: 24 }}
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {sessions.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="t-tag" style={{ marginBottom: 6 }}>
                Route to
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={'chip' + (sessionId === null ? ' signal' : '')}
                  onClick={() => setSessionId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  Auto-route
                </button>
                {sessions.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={'chip' + (sessionId === s.id ? ' signal' : '')}
                    onClick={() => setSessionId(s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div
              className="t-body-sm"
              style={{ color: 'var(--red)', marginTop: 12 }}
            >
              {error}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={onFilePick}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <button
              className="btn primary"
              type="button"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? progressiveVerb(definition.captureVerb) : definition.captureVerb}
            </button>
            <button
              className="btn outline"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              <Icon name="file" size={14} /> Attach
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function capturePlaceholder(experience: string): string {
  switch (experience) {
    case 'field_journal':
      return 'Pour into the journal...'
    case 'daily_edition':
      return 'File to the wire...'
    case 'observatory':
      return 'Record an observation...'
    case 'workbench':
      return 'Create a workpiece...'
    case 'quiet_atrium':
      return 'Pin something to the room...'
    default:
      return "Type, paste a link, or describe what you're sending..."
  }
}

function progressiveVerb(verb: string): string {
  switch (verb) {
    case 'File':
      return 'Filing...'
    case 'Pin':
      return 'Pinning...'
    case 'Pour':
      return 'Pouring...'
    case 'Record':
      return 'Recording...'
    case 'Dispatch':
      return 'Dispatching...'
    default:
      return 'Sending...'
  }
}
