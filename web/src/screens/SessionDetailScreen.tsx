import { useEffect, useState, type JSX } from 'react'

import type { Artifact, Ingest, Reflex, Source } from '@shared/index'
import { ArtifactCard } from '../components/artifact/ArtifactRenderer'
import { Icon } from '../components/icons/Icon'
import { ScreenHead } from '../components/shell/Shell'
import { EXPERIENCES } from '../design/experience'
import { useResolvedExperience } from '../design/useExperience'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { useConfirm } from '../store/useConfirm'
import { capitalize, pluralize } from './sessions/utils'

export function SessionDetailScreen({ id }: { id: string }): JSX.Element {
  const back = useAppStore((s) => s.back)
  const go = useAppStore((s) => s.go)
  const session = useAppStore((s) => s.sessions.find((s) => s.id === id))
  const upsertSession = useAppStore((s) => s.upsertSession)
  const confirm = useConfirm((s) => s.request)
  const experience = useResolvedExperience()
  const definition = EXPERIENCES[experience]
  const sessionNoun = definition.sessionNoun
  const artifactNoun = definition.artifactNoun

  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [ingests, setIngests] = useState<Ingest[]>([])
  const [attachedSources, setAttachedSources] = useState<Source[]>([])
  const [reflexes, setReflexes] = useState<Reflex[]>([])
  const [loading, setLoading] = useState(true)
  const [restartFeedback, setRestartFeedback] = useState<string | null>(null)

  const onRestartAgentThread = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Restart agent thread?',
      body:
        "Your local history (artifacts, ingests, attached sources, reflexes) stays. The agent's managed-session memory for this thread is dropped; the next ingest will create a fresh managed session bound to the latest prompt + tools. Use this after running pnpm bootstrap-agent so existing sessions pick up the new contract.",
      confirmLabel: 'Restart thread',
    })
    if (!ok) return
    try {
      const next = await api.restartAgentThread(id)
      upsertSession(next)
      setRestartFeedback('Agent thread reset. The next ingest will start fresh.')
    } catch (e) {
      setRestartFeedback(
        e instanceof Error ? `Failed: ${e.message}` : 'Failed to restart agent thread.',
      )
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.listArtifacts({ session_id: id, limit: 50 }),
      api.listIngests(id),
      api.sourcesForSession(id).catch(() => ({ sources: [] })),
      api.listReflexes(id).catch(() => ({ reflexes: [] })),
    ])
      .then(([a, i, src, rfl]) => {
        if (cancelled) return
        setArtifacts(a.artifacts)
        setIngests(i.ingests)
        setAttachedSources(src.sources)
        setReflexes(rfl.reflexes)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!session) {
    return (
      <div className="screen enter">
        <ScreenHead onBack={back} title={capitalize(sessionNoun)} />
        <div className="briefing">
          <div className="t-body-sm">{capitalize(sessionNoun)} not found.</div>
        </div>
      </div>
    )
  }

  // Interleave ingests + artifacts by created_at desc into a single timeline.
  type TLItem =
    | { kind: 'ingest'; data: Ingest }
    | { kind: 'artifact'; data: Artifact }
  const timeline: TLItem[] = [
    ...artifacts.map((a) => ({ kind: 'artifact' as const, data: a })),
    ...ingests.map((i) => ({ kind: 'ingest' as const, data: i })),
  ].sort((a, b) => (a.data.created_at < b.data.created_at ? 1 : -1))

  return (
    <div className="screen enter" data-screen-label="04 Session Detail">
      <ScreenHead onBack={back} title={capitalize(sessionNoun)} />
      <div
        style={{ padding: '0 var(--screen-pad) var(--space-md)' }}
        className="rise"
      >
        <div
          className="t-tag"
          style={{ marginBottom: 6, color: 'var(--signal)' }}
        >
          {session.status === 'active' ? '● Active' : '○ ' + session.status}
        </div>
        <h1 className="t-headline" style={{ marginBottom: 10 }}>
          {session.name}
        </h1>
        {session.description && (
          <p className="t-body-sm">{session.description}</p>
        )}

        <div className="c-data-row" style={{ marginTop: 14 }}>
          <div className="cell">
            <span className="v signal">{session.ingest_count}</span>
            <span className="l">Ingests</span>
          </div>
          <div className="cell">
            <span className="v">{session.artifact_count}</span>
            <span className="l">{capitalize(pluralize(artifactNoun))}</span>
          </div>
          <div className="cell">
            <span className="v cool">{session.config.triggers?.length ?? 0}</span>
            <span className="l">Triggers</span>
          </div>
        </div>

        <button
          type="button"
          className="card tap"
          onClick={() => go({ name: 'triggers' })}
          style={{
            marginTop: 12,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            textAlign: 'left',
          }}
        >
          <Icon name="gear" size={14} />
          <div style={{ flex: 1 }}>
            <div className="t-body-sm" style={{ color: 'var(--text)' }}>
              Manage triggers
            </div>
            <div className="t-caption">
              Schedule prompts that fire on their own
            </div>
          </div>
          <Icon name="chevron-right" size={12} />
        </button>

        {/* ── Sources strip ─────────────────────────────────────────── */}
        <div style={{ marginTop: 14 }}>
          <div
            className="t-tag"
            style={{
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>SOURCES</span>
            <button
              type="button"
              className="versions-link"
              onClick={() => go({ name: 'sources' })}
            >
              Manage
            </button>
          </div>
          <div className="sources-strip">
            {attachedSources.length === 0 && (
              <span
                className="t-body-sm"
                style={{ color: 'var(--text-3)' }}
              >
                No sources attached. Attach one from the Sources screen so
                the agent can pull on ambient threads between your turns.
              </span>
            )}
            {attachedSources.map((src) => (
              <button
                key={src.id}
                type="button"
                className={'source-pill ' + src.status}
                onClick={() => go({ name: 'source', id: src.id })}
              >
                <span className="dot" />
                <span className="name">{src.name}</span>
                {src.last_observation_at && (
                  <span className="when">
                    {relativeShort(src.last_observation_at)}
                  </span>
                )}
              </button>
            ))}
            {attachedSources.length > 0 && (
              <button
                type="button"
                className="source-pill add"
                onClick={() => go({ name: 'sources' })}
              >
                <span className="name">+ attach</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Reflexes ─────────────────────────────────────────────── */}
        {reflexes.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              className="t-tag"
              style={{
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>REFLEXES ({reflexes.filter((r) => r.approved).length} active)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {reflexes.map((r) => (
                <ReflexRow
                  key={r.id}
                  reflex={r}
                  sessionId={id}
                  onUpdate={(next) =>
                    setReflexes((s) =>
                      s.map((x) => (x.id === next.id ? next : x)),
                    )
                  }
                  onDelete={() =>
                    setReflexes((s) => s.filter((x) => x.id !== r.id))
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Restart agent thread ─────────────────────────────────
            A managed Anthropic session is pinned to the agent's prompt
            version at create-time. After `pnpm bootstrap-agent` pushes
            an update, existing sessions stay on the old pin. This
            action drops the pin; the next ingest creates a fresh
            managed session on the latest agent version. */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: '1px dashed var(--hairline)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <button
            type="button"
            className="versions-link"
            onClick={() => void onRestartAgentThread()}
            style={{ alignSelf: 'flex-start' }}
          >
            Restart agent thread
          </button>
          <p
            className="t-caption"
            style={{
              color: 'var(--text-3)',
              fontSize: 11,
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            Drops this session's managed-Anthropic-session memory. Local
            history stays; the next ingest creates a fresh managed
            session on the agent's current prompt + tools. Useful after
            an agent prompt update.
          </p>
          {restartFeedback && (
            <p
              className="t-caption"
              style={{
                color: restartFeedback.startsWith('Failed')
                  ? 'var(--red)'
                  : 'var(--signal)',
                fontSize: 11,
                marginTop: 4,
              }}
            >
              {restartFeedback}
            </p>
          )}
        </div>
      </div>

      <div style={{ padding: '0 var(--screen-pad)' }}>
        <div className="section-head" style={{ marginBottom: 14 }}>
          Timeline
        </div>
        {loading ? (
          <div className="t-body-sm" style={{ color: 'var(--text-3)' }}>
            Loading…
          </div>
        ) : timeline.length === 0 ? (
          <div className="t-body-sm" style={{ color: 'var(--text-3)' }}>
            Nothing yet. Tap + to send your first ingest.
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 11,
                top: 8,
                bottom: 8,
                width: 1,
                background:
                  'linear-gradient(to bottom, transparent, var(--hairline) 8%, var(--hairline) 92%, transparent)',
              }}
            />
            {timeline.map((item) =>
              item.kind === 'artifact' ? (
                <ArtifactRow
                  key={`a-${item.data.id}`}
                  artifact={item.data}
                  onOpen={() => go({ name: 'artifact', id: item.data.id })}
                />
              ) : (
                <IngestRow key={`i-${item.data.id}`} ingest={item.data} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ArtifactRow({
  artifact,
  onOpen,
}: {
  artifact: Artifact
  onOpen: () => void
}): JSX.Element {
  const accent = artifact.header.label_color ?? 'signal'
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        paddingBottom: 14,
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 22,
          flexShrink: 0,
          paddingTop: 14,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: `var(--${accent})`,
            boxShadow: `0 0 0 3px var(--bg), 0 0 12px var(--${accent})`,
            zIndex: 1,
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-caption" style={{ marginBottom: 4 }}>
          {artifact.header.timestamp_display} · agent emitted
        </div>
        <ArtifactCard artifact={artifact} onTap={onOpen} />
      </div>
    </div>
  )
}

function IngestRow({ ingest }: { ingest: Ingest }): JSX.Element {
  const iconForType = (
    type: Ingest['type'],
  ): React.ComponentProps<typeof Icon>['name'] => {
    switch (type) {
      case 'voice':
        return 'mic'
      case 'photo':
        return 'photo'
      case 'link':
        return 'link'
      case 'file':
        return 'file'
      default:
        return 'pen'
    }
  }
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        paddingBottom: 14,
        position: 'relative',
      }}
    >
      <div
        style={{
          width: 22,
          flexShrink: 0,
          paddingTop: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            border: '1.5px solid var(--text-3)',
            background: 'var(--bg)',
            zIndex: 1,
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <div className="t-caption" style={{ marginBottom: 2 }}>
          {ingest.created_at.slice(11, 16)} · you sent
        </div>
        <div
          style={{
            background: 'var(--surface-1)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: ingest.raw_text ? 4 : 0,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: 'var(--surface-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-2)',
              }}
            >
              <Icon name={iconForType(ingest.type)} size={11} />
            </span>
            <span className="t-body-sm" style={{ color: 'var(--text)' }}>
              {ingest.metadata.file_name ?? ingest.type}
            </span>
          </div>
          {ingest.raw_text && (
            <div
              className="t-caption"
              style={{
                paddingLeft: 26,
                color: 'var(--text-3)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {ingest.raw_text.length > 140
                ? ingest.raw_text.slice(0, 140) + '…'
                : ingest.raw_text}
            </div>
          )}
          {/* Inline image preview for photo ingests */}
          {ingest.type === 'photo' &&
            ingest.metadata.file_id &&
            ingest.metadata.mime_type?.startsWith('image/') && (
              <div
                style={{
                  marginTop: 8,
                  marginLeft: 26,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: 'var(--surface-2)',
                  maxWidth: 280,
                }}
              >
                <img
                  src={`/api/files/${ingest.metadata.file_id}/content`}
                  alt={ingest.metadata.file_name ?? 'photo'}
                  style={{
                    width: '100%',
                    display: 'block',
                    maxHeight: 240,
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

function ReflexRow({
  reflex,
  sessionId,
  onUpdate,
  onDelete,
}: {
  reflex: Reflex
  sessionId: string
  onUpdate: (next: Reflex) => void
  onDelete: () => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const togglePause = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await api.updateReflex(sessionId, reflex.id, {
        enabled: !reflex.enabled,
      })
      onUpdate(next)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (): Promise<void> => {
    setBusy(true)
    try {
      await api.deleteReflex(sessionId, reflex.id)
      onDelete()
    } catch {
      setBusy(false)
    }
  }
  return (
    <div className={'reflex-row' + (reflex.enabled ? '' : ' disabled')}>
      <div className="top">
        <span className="desc">{reflex.description}</span>
        <span className="meta">
          fired {reflex.fire_count}× ·{' '}
          {reflex.approved ? 'approved' : 'unapproved'}
        </span>
      </div>
      <div className="meta">
        debounce ≥ {Math.round(reflex.debounce_seconds / 60)} min
        {reflex.last_fired_at && (
          <> · last {relativeShort(reflex.last_fired_at)}</>
        )}
      </div>
      <div className="actions">
        <button
          type="button"
          className="versions-link"
          onClick={togglePause}
          disabled={busy}
        >
          {reflex.enabled ? 'Pause' : 'Resume'}
        </button>
        <button
          type="button"
          className="versions-link"
          onClick={remove}
          disabled={busy}
          style={{ color: 'var(--red)' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function relativeShort(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (ms < 60_000) return 'now'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.round(hr / 24)
  return `${day}d`
}

/* pluralize / capitalize imported from ./sessions/utils — kept in one
   place so the noun strategy stays consistent across screens. */
