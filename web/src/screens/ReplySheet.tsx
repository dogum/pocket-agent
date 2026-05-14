// Reply-to-artifact sheet. Universal "respond in your own words"
// affordance — the user types, we create an ingest in the artifact's
// session, the run dispatcher picks it up. Because runs reuse the
// same managed session, the agent sees the artifact in its own context
// when handling the reply.

import { useEffect, useRef, useState, type JSX } from 'react'

import type { Artifact } from '@shared/index'
import { Icon } from '../components/icons/Icon'
import { AgentPresence } from '../components/shell/AgentPresence'
import { useRunDispatcher } from '../hooks/useRunDispatcher'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

export function ReplySheet({
  artifact,
  onClose,
}: {
  artifact: Artifact
  onClose: () => void
}): JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const activeRunId = useAppStore((s) => s.activeRunId)
  const queuedCount = useAppStore((s) => s.queuedRuns.length)
  const { dispatch } = useRunDispatcher()

  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const session = sessions.find((s) => s.id === artifact.session_id)

  // Esc closes the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (): Promise<void> => {
    if (submittingRef.current) return
    setError(null)
    const trimmed = text.trim()
    if (!trimmed) {
      setError('Type your reply first.')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    try {
      // We embed a "Reply to:" header so the agent can locate the
      // artifact in its own context window. The managed session has
      // it already, but a hint reduces ambiguity for old artifacts.
      const replyText = `Reply to artifact "${artifact.header.title}":\n\n${trimmed}`
      const ingest = await api.createIngest({
        session_id: artifact.session_id,
        type: 'text',
        raw_text: replyText,
        metadata: { source_app: 'reply' },
      })
      void dispatch(artifact.session_id, ingest.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="handle" />
        <div className="body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 12,
            }}
          >
            <div className="t-tag">
              Reply{session ? ` · ${session.name}` : ''}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div
            className="card"
            style={{
              padding: 12,
              marginBottom: 12,
              background: 'var(--surface-2)',
            }}
          >
            <div
              className="t-tag"
              style={{
                color:
                  artifact.header.label_color
                    ? `var(--${artifact.header.label_color})`
                    : 'var(--signal)',
                marginBottom: 4,
              }}
            >
              {artifact.header.label} · {artifact.header.timestamp_display}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 16,
                lineHeight: 1.25,
              }}
            >
              {artifact.header.title}
            </div>
            {artifact.header.summary && (
              <div className="t-body-sm" style={{ marginTop: 4 }}>
                {artifact.header.summary}
              </div>
            )}
          </div>

          {activeRunId && (
            <div style={{ marginBottom: 12 }}>
              <AgentPresence
                state="thinking"
                detail="Your reply will run as soon as it finishes."
                readout={queuedCount > 0 ? `+${queuedCount} queued` : undefined}
                compact
              />
            </div>
          )}

          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Type your reply…"
            style={{
              width: '100%',
              padding: 12,
              background: 'var(--surface-2)',
              borderRadius: 12,
              fontSize: 14,
              fontFamily: 'var(--sans)',
              color: 'var(--text)',
              resize: 'none',
              marginBottom: 14,
            }}
          />

          {error && (
            <div
              className="t-body-sm"
              style={{ color: 'var(--red)', marginBottom: 10 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Sending…' : 'Send reply'}
            </button>
            <button
              type="button"
              className="btn outline"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
