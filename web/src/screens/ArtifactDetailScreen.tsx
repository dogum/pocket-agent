import { useEffect, useState, type JSX } from 'react'

import type { Artifact, ArtifactAction } from '@shared/index'
import { ArtifactDetail } from '../components/artifact/ArtifactRenderer'
import { Icon } from '../components/icons/Icon'
import { ScreenHead } from '../components/shell/Shell'
import { useRunDispatcher } from '../hooks/useRunDispatcher'
import { api } from '../lib/api'
import { artifactToMarkdown } from '../lib/artifactToMarkdown'
import { useAppStore } from '../store/useAppStore'
import { ReplySheet } from './ReplySheet'

export function ArtifactDetailScreen({ id }: { id: string }): JSX.Element {
  const back = useAppStore((s) => s.back)
  const go = useAppStore((s) => s.go)
  const cached = useAppStore((s) => s.artifacts.find((a) => a.id === id))
  const sessions = useAppStore((s) => s.sessions)
  const { dispatch } = useRunDispatcher()

  const [artifact, setArtifact] = useState<Artifact | null>(cached ?? null)
  const [error, setError] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)

  useEffect(() => {
    if (cached) return
    let cancelled = false
    api
      .getArtifact(id)
      .then((a) => {
        if (!cancelled) setArtifact(a)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [id, cached])

  const handleAction = async (act: ArtifactAction): Promise<void> => {
    if (!artifact) return
    setActionFeedback(null)

    switch (act.action) {
      case 'dismiss': {
        await api.archiveArtifact(artifact.id, true)
        back()
        return
      }
      case 'external_link': {
        if (act.url) window.open(act.url, '_blank', 'noopener')
        return
      }
      case 'navigate': {
        if (act.target_id) {
          // Best-effort — try as an artifact id, fall back to session.
          const isSession = sessions.some((s) => s.id === act.target_id)
          go(
            isSession
              ? { name: 'session', id: act.target_id }
              : { name: 'artifact', id: act.target_id },
          )
        }
        return
      }
      case 'share': {
        const summary = artifact.header.summary ?? ''
        const text = `${artifact.header.title}\n${summary}`
        if (navigator.share) {
          try {
            await navigator.share({ title: artifact.header.title, text })
          } catch {
            // user cancelled — no-op
          }
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          setActionFeedback('Copied to clipboard')
        }
        return
      }
      case 'follow_up': {
        const prompt = act.prompt?.trim()
        if (!prompt) {
          setActionFeedback('Action has no prompt — nothing to send.')
          return
        }
        const ingest = await api.createIngest({
          session_id: artifact.session_id,
          type: 'text',
          raw_text: prompt,
        })
        setActionFeedback(`Sent: "${prompt.slice(0, 60)}${prompt.length > 60 ? '…' : ''}"`)
        void dispatch(artifact.session_id, ingest.id)
        return
      }
      case 'confirm': {
        // Encode the user's confirmation as a follow-up so the agent sees it.
        const ingest = await api.createIngest({
          session_id: artifact.session_id,
          type: 'text',
          raw_text: `User confirmed: ${act.label} (artifact ${artifact.id})`,
        })
        setActionFeedback('Confirmed.')
        void dispatch(artifact.session_id, ingest.id)
        return
      }
      case 'export': {
        // Render the artifact as Markdown and drop into the clipboard.
        const md = artifactToMarkdown(artifact)
        try {
          await navigator.clipboard.writeText(md)
          setActionFeedback('Copied to clipboard as Markdown.')
        } catch {
          setActionFeedback("Couldn't access clipboard — try the Share action instead.")
        }
        return
      }
      default:
        setActionFeedback(`Action "${act.action}" not handled yet.`)
    }
  }

  const handleQuestionSetSubmit = async (
    answers: Array<{ id: string; label: string; value: string }>,
  ): Promise<void> => {
    if (!artifact) return
    // Compose a single reply with all answers inline. The agent receives
    // it on the same managed session, so it sees both the question_set
    // it emitted and the user's structured response.
    const filled = answers.filter((a) => a.value.trim().length > 0)
    const body = filled
      .map((a) => `- ${a.label}\n  ${a.value.trim()}`)
      .join('\n')
    const replyText = `Answers to "${artifact.header.title}":\n\n${body}`
    try {
      const ingest = await api.createIngest({
        session_id: artifact.session_id,
        type: 'text',
        raw_text: replyText,
        metadata: { source_app: 'question_set' },
      })
      void dispatch(artifact.session_id, ingest.id)
      setActionFeedback(
        useAppStore.getState().activeRunId
          ? 'Sent — queued behind the current run.'
          : 'Sent — agent is on it.',
      )
    } catch (e) {
      setActionFeedback(
        e instanceof Error ? e.message : 'Failed to send answers.',
      )
    }
  }

  if (error) {
    return (
      <div className="screen enter">
        <ScreenHead onBack={back} title="Artifact" />
        <div style={{ padding: 'var(--screen-pad)', color: 'var(--text-2)' }}>
          {error}
        </div>
      </div>
    )
  }
  if (!artifact) {
    return (
      <div className="screen enter">
        <ScreenHead onBack={back} title="Artifact" />
        <div className="briefing">
          <div
            className="shimmer"
            style={{ height: 28, borderRadius: 6, marginBottom: 12 }}
          />
          <div className="shimmer" style={{ height: 14, borderRadius: 4 }} />
        </div>
      </div>
    )
  }

  const session = sessions.find((s) => s.id === artifact.session_id)
  return (
    <div className="screen enter" data-screen-label="02 Artifact Detail">
      <ScreenHead onBack={back} title={artifact.header.label} />
      <ArtifactDetail
        artifact={artifact}
        onAction={handleAction}
        onQuestionSetSubmit={(a) => void handleQuestionSetSubmit(a)}
      />

      {/* Universal Reply — works for any artifact, not just ones the
          agent flagged with a follow_up action. */}
      <div
        style={{
          margin: '14px var(--screen-pad) 0',
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          className="btn primary"
          onClick={() => setReplyOpen(true)}
          style={{ flex: 1 }}
        >
          <Icon name="pen" size={14} />
          Reply
        </button>
      </div>

      {actionFeedback && (
        <div
          style={{
            margin: '12px var(--screen-pad) 0',
            padding: '10px 14px',
            background: 'var(--surface-1)',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="check" size={12} />
          <span className="t-body-sm">{actionFeedback}</span>
        </div>
      )}
      {session && (
        <div
          style={{
            margin: '20px var(--screen-pad)',
            padding: '14px 0',
            borderTop: '1px solid var(--hairline)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="orbit" size={12} />
          <span className="t-caption">
            From{' '}
            <button
              type="button"
              onClick={() => go({ name: 'session', id: session.id })}
              style={{
                textDecoration: 'underline',
                color: 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              {session.name}
            </button>
          </span>
        </div>
      )}
      {replyOpen && (
        <ReplySheet artifact={artifact} onClose={() => setReplyOpen(false)} />
      )}
    </div>
  )
}
