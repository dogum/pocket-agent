import { useEffect, useState, type JSX } from 'react'

import type { Artifact, Ingest } from '@shared/index'
import { ArtifactCard } from '../components/artifact/ArtifactRenderer'
import { Icon } from '../components/icons/Icon'
import { ScreenHead } from '../components/shell/Shell'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

export function SessionDetailScreen({ id }: { id: string }): JSX.Element {
  const back = useAppStore((s) => s.back)
  const go = useAppStore((s) => s.go)
  const session = useAppStore((s) => s.sessions.find((s) => s.id === id))

  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [ingests, setIngests] = useState<Ingest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.listArtifacts({ session_id: id, limit: 50 }),
      api.listIngests(id),
    ])
      .then(([a, i]) => {
        if (cancelled) return
        setArtifacts(a.artifacts)
        setIngests(i.ingests)
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
        <ScreenHead onBack={back} title="Session" />
        <div className="briefing">
          <div className="t-body-sm">Session not found.</div>
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
      <ScreenHead onBack={back} title="Session" />
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
            <span className="l">Artifacts</span>
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
