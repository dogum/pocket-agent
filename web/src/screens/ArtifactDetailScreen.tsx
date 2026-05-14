import { useEffect, useState, type JSX } from 'react'

import type {
  Artifact,
  ArtifactAction,
  ArtifactVersion,
  ReflexProposalComponent,
} from '@shared/index'
import { ArtifactDetail, safeHref } from '../components/artifact/ArtifactRenderer'
import { Icon } from '../components/icons/Icon'
import { ScreenHead } from '../components/shell/Shell'
import { useRunDispatcher } from '../hooks/useRunDispatcher'
import { api } from '../lib/api'
import {
  buildArtifactInteractionPrompt,
  type ArtifactInteractionPayload,
} from '../lib/artifactInteractions'
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<ArtifactVersion[] | null>(null)

  // Mirror server-side artifact.updated events when the same id is on screen.
  useEffect(() => {
    if (!cached) return
    setArtifact(cached)
  }, [cached])

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
        if (act.url) {
          // Agent-supplied URL — only follow http/https. window.open with
          // javascript: runs in the app origin; same XSS path as a raw
          // href bind. Belt-and-suspenders with link_preview's safeHref.
          const safe = safeHref(act.url)
          if (safe) {
            window.open(safe, '_blank', 'noopener')
          } else {
            setActionFeedback(
              `Blocked: action URL must use http:// or https://`,
            )
          }
        }
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

  const handleReflexApprove = async (
    proposal: ReflexProposalComponent,
  ): Promise<void> => {
    if (!artifact) return
    try {
      await api.createReflex(artifact.session_id, {
        description: proposal.description,
        source_name: proposal.source_name,
        kickoff_prompt: proposal.kickoff_prompt,
        artifact_hint: proposal.artifact_hint,
        debounce_seconds: proposal.debounce_seconds ?? 300,
        approved: true,
        match: {
          source_id: proposal.source_name,
          conditions: proposal.conditions,
        },
      })
      setActionFeedback('Reflex approved — it will fire on matching observations.')
    } catch (e) {
      setActionFeedback(
        e instanceof Error ? e.message : 'Failed to approve reflex.',
      )
      throw e
    }
  }

  const openHistory = async (): Promise<void> => {
    if (!artifact) return
    setHistoryOpen(true)
    if (versions) return
    try {
      const { versions: v } = await api.listArtifactVersions(artifact.id)
      setVersions(v)
    } catch {
      setVersions([])
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

  const handleComponentInteraction = async (
    interaction: ArtifactInteractionPayload,
  ): Promise<void> => {
    if (!artifact) return
    try {
      if (interaction.kind === 'trigger_proposal.approve') {
        const payload = triggerPayload(interaction.payload)
        if (!payload) {
          setActionFeedback('Trigger proposal was missing schedule details.')
          return
        }
        await api.createTrigger(artifact.session_id, {
          schedule: payload.cron,
          description: payload.cadence_label,
          prompt: payload.action,
          enabled: true,
        })
        setActionFeedback('Trigger approved — it will run on schedule.')
        return
      }

      const prompt = buildArtifactInteractionPrompt({ artifact, interaction })
      const ingest = await api.createIngest({
        session_id: artifact.session_id,
        type: 'text',
        raw_text: prompt,
        metadata: {
          source_app: 'artifact_interaction',
          artifact_id: artifact.id,
          interaction_kind: interaction.kind,
        },
      })
      void dispatch(artifact.session_id, ingest.id)
      setActionFeedback(
        useAppStore.getState().activeRunId
          ? 'Sent — queued behind the current run.'
          : 'Sent — agent is on it.',
      )
    } catch (e) {
      setActionFeedback(
        e instanceof Error ? e.message : 'Failed to handle interaction.',
      )
      if (interaction.kind === 'trigger_proposal.approve') throw e
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
        onInteraction={(interaction) => void handleComponentInteraction(interaction)}
        onReflexApprove={handleReflexApprove}
        onShowHistory={() => void openHistory()}
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
      {historyOpen && (
        <ArtifactHistorySheet
          versions={versions}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}

function triggerPayload(
  payload: unknown,
): { cadence_label: string; cron: string; action: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const o = payload as Record<string, unknown>
  if (
    typeof o.cadence_label !== 'string' ||
    typeof o.cron !== 'string' ||
    typeof o.action !== 'string'
  ) {
    return null
  }
  return {
    cadence_label: o.cadence_label,
    cron: o.cron,
    action: o.action,
  }
}

function ArtifactHistorySheet({
  versions,
  onClose,
}: {
  versions: ArtifactVersion[] | null
  onClose: () => void
}): JSX.Element {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="handle" />
        <div className="body" style={{ paddingBottom: 24 }}>
          <div className="t-tag" style={{ marginBottom: 8 }}>
            VERSION HISTORY
          </div>
          {!versions && (
            <div className="shimmer" style={{ height: 60, borderRadius: 8 }} />
          )}
          {versions && versions.length === 0 && (
            <p className="t-body-sm" style={{ color: 'var(--text-3)' }}>
              No history yet.
            </p>
          )}
          {versions && versions.length > 0 && (
            <div>
              {versions.map((v) => (
                <div key={v.id} className="version-row">
                  <div className="top">
                    <span className="tag">v{v.version}</span>
                    <span className="when">{shortDate(v.created_at)}</span>
                  </div>
                  <div className="t-body-sm" style={{ marginBottom: 4 }}>
                    {v.header.title}
                  </div>
                  {v.reason && <div className="reason">{v.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
