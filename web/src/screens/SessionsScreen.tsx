import { useEffect, useState, type JSX } from 'react'

import type { Session } from '@shared/index'
import { Icon } from '../components/icons/Icon'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { confirm as confirmDialog } from '../store/useConfirm'

export function SessionsScreen(): JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const upsert = useAppStore((s) => s.upsertSession)
  const setData = useAppStore((s) => s.setData)
  const go = useAppStore((s) => s.go)

  const [showArchived, setShowArchived] = useState(false)
  const [archived, setArchived] = useState<Session[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [menuFor, setMenuFor] = useState<Session | null>(null)

  // Hydrate archived list when toggled on.
  useEffect(() => {
    if (!showArchived) return
    let cancelled = false
    api
      .listSessions('archived')
      .then(({ sessions }) => {
        if (!cancelled) setArchived(sessions)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [showArchived])

  const refreshActive = async (): Promise<void> => {
    const { sessions } = await api.listSessions()
    setData({ sessions })
  }
  const refreshArchived = async (): Promise<void> => {
    const { sessions } = await api.listSessions('archived')
    setArchived(sessions)
  }

  const onCreate = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    const session = await api.createSession({
      name: trimmed,
      description: description.trim() || undefined,
    })
    upsert(session)
    setName('')
    setDescription('')
    setCreating(false)
    go({ name: 'session', id: session.id })
  }

  const onArchive = async (s: Session): Promise<void> => {
    await api.updateSession(s.id, { archived: true })
    setMenuFor(null)
    await Promise.all([refreshActive(), showArchived ? refreshArchived() : null])
  }

  const onUnarchive = async (s: Session): Promise<void> => {
    await api.updateSession(s.id, { archived: false })
    setMenuFor(null)
    await Promise.all([refreshActive(), refreshArchived()])
  }

  const onComplete = async (s: Session): Promise<void> => {
    await api.updateSession(s.id, { status: 'complete' })
    setMenuFor(null)
    await refreshActive()
  }

  const onReactivate = async (s: Session): Promise<void> => {
    await api.updateSession(s.id, { status: 'active' })
    setMenuFor(null)
    await refreshActive()
  }

  const onDelete = async (s: Session): Promise<void> => {
    setMenuFor(null)
    const ok = await confirmDialog({
      title: `Delete "${s.name}"?`,
      body: `Permanently removes this session, ${s.ingest_count} ingest${s.ingest_count === 1 ? '' : 's'}, and ${s.artifact_count} artifact${s.artifact_count === 1 ? '' : 's'}. The agent stays configured. Type "delete" to confirm.`,
      confirmLabel: 'Delete forever',
      destructive: true,
      typedConfirm: 'delete',
    })
    if (!ok) return
    await api.deleteSession(s.id)
    await Promise.all([refreshActive(), showArchived ? refreshArchived() : null])
  }

  return (
    <div className="screen enter" data-screen-label="03 Sessions">
      <div
        style={{ padding: 'var(--space-md) var(--screen-pad) var(--space-lg)' }}
        className="rise"
      >
        <div className="t-tag" style={{ marginBottom: 6 }}>
          all sessions
        </div>
        <h1 className="t-headline" style={{ marginBottom: 10 }}>
          Your <em>sessions</em>
        </h1>
        <p className="t-body-sm" style={{ marginBottom: 14 }}>
          Each session is a long-running thread the agent works on autonomously.
          Send anything — it routes itself.
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="chip"
            style={{
              cursor: 'pointer',
              background: showArchived ? 'var(--surface-2)' : 'var(--signal-dim)',
              color: showArchived ? 'var(--text-3)' : 'var(--signal)',
            }}
            onClick={() => setShowArchived(false)}
          >
            Active
          </button>
          <button
            type="button"
            className="chip"
            style={{
              cursor: 'pointer',
              background: !showArchived ? 'var(--surface-2)' : 'var(--signal-dim)',
              color: !showArchived ? 'var(--text-3)' : 'var(--signal)',
            }}
            onClick={() => setShowArchived(true)}
          >
            Archived
          </button>
        </div>
      </div>

      <div className="card-stack rise">
        {(showArchived ? archived : sessions).map((s) => (
          <SessionCard
            key={s.id}
            s={s}
            onOpen={() => go({ name: 'session', id: s.id })}
            onMenu={() => setMenuFor(s)}
          />
        ))}

        {!showArchived && sessions.length === 0 && (
          <div
            className="card bordered"
            style={{ padding: 18, color: 'var(--text-3)' }}
          >
            <div className="t-body-sm" style={{ color: 'var(--text)' }}>
              No active sessions
            </div>
            <div className="t-caption" style={{ marginTop: 4 }}>
              Tap "New session" to start one.
            </div>
          </div>
        )}
        {showArchived && archived.length === 0 && (
          <div
            className="card bordered"
            style={{ padding: 18, color: 'var(--text-3)' }}
          >
            <div className="t-body-sm" style={{ color: 'var(--text)' }}>
              Nothing archived
            </div>
            <div className="t-caption" style={{ marginTop: 4 }}>
              Archived sessions land here.
            </div>
          </div>
        )}

        {!showArchived && (
          <>
            {creating ? (
              <div
                className="card"
                style={{
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <input
                  autoFocus
                  placeholder="Session name (e.g. Marathon · Berlin)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
                <input
                  placeholder="One-line description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    background: 'var(--surface-2)',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={onCreate}
                  >
                    Create
                  </button>
                  <button
                    className="btn outline"
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      setName('')
                      setDescription('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="card tap"
                style={{
                  borderRadius: 16,
                  border: '1px dashed var(--hairline-strong)',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: 22,
                  color: 'var(--text-3)',
                }}
              >
                <Icon name="plus" size={14} />
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  New session
                </span>
              </button>
            )}
          </>
        )}
      </div>

      {menuFor && (
        <SessionMenu
          session={menuFor}
          onClose={() => setMenuFor(null)}
          onArchive={() => void onArchive(menuFor)}
          onUnarchive={() => void onUnarchive(menuFor)}
          onComplete={() => void onComplete(menuFor)}
          onReactivate={() => void onReactivate(menuFor)}
          onDelete={() => void onDelete(menuFor)}
        />
      )}
    </div>
  )
}

function SessionCard({
  s,
  onOpen,
  onMenu,
}: {
  s: Session
  onOpen: () => void
  onMenu: () => void
}): JSX.Element {
  return (
    <div
      className="card tap"
      style={{
        padding: '18px 18px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          className={
            'chip ' +
            (s.archived
              ? ''
              : s.status === 'active'
                ? 'signal'
                : s.status === 'complete'
                  ? 'cool'
                  : '')
          }
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'currentColor',
              boxShadow:
                s.status === 'active' && !s.archived
                  ? '0 0 8px currentColor'
                  : 'none',
            }}
          />
          {s.archived ? 'archived' : s.status}
        </span>
        <button
          type="button"
          className="icon-btn"
          onClick={(e) => {
            e.stopPropagation()
            onMenu()
          }}
          style={{ width: 28, height: 28 }}
          title="More"
        >
          <Icon name="menu" size={14} />
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          textAlign: 'left',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <div className="t-subtitle" style={{ fontFamily: 'var(--serif)' }}>
          {s.name}
        </div>
        {s.description && (
          <div className="t-body-sm" style={{ marginTop: 2 }}>
            {s.description}
          </div>
        )}
      </button>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--hairline)',
          paddingTop: 10,
          marginTop: 4,
        }}
      >
        <span className="t-caption">{relativeTime(s.updated_at)}</span>
        <span className="t-caption">
          {s.ingest_count} in · {s.artifact_count} out
        </span>
      </div>
    </div>
  )
}

function SessionMenu({
  session,
  onClose,
  onArchive,
  onUnarchive,
  onComplete,
  onReactivate,
  onDelete,
}: {
  session: Session
  onClose: () => void
  onArchive: () => void
  onUnarchive: () => void
  onComplete: () => void
  onReactivate: () => void
  onDelete: () => void
}): JSX.Element {
  const isComplete = session.status === 'complete'
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
              paddingBottom: 14,
            }}
          >
            <div className="t-tag">{session.name}</div>
            <button type="button" className="icon-btn" onClick={onClose}>
              <Icon name="close" size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {session.archived ? (
              <MenuItem icon="orbit" label="Unarchive" onClick={onUnarchive} />
            ) : (
              <MenuItem icon="archive" label="Archive" onClick={onArchive} />
            )}
            {!session.archived &&
              (isComplete ? (
                <MenuItem
                  icon="orbit"
                  label="Reactivate"
                  onClick={onReactivate}
                />
              ) : (
                <MenuItem
                  icon="check"
                  label="Mark complete"
                  onClick={onComplete}
                />
              ))}
            <MenuItem
              icon="archive"
              label="Delete forever"
              onClick={onDelete}
              destructive
            />
          </div>
        </div>
      </div>
    </>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentProps<typeof Icon>['name']
  label: string
  onClick: () => void
  destructive?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      className="status-row"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        color: destructive ? 'var(--red)' : 'var(--text)',
      }}
    >
      <div className="left">
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: destructive ? 'var(--red-dim)' : 'var(--surface-2)',
            color: destructive ? 'var(--red)' : 'var(--text-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={14} />
        </span>
        <span className="t-body-sm" style={{ color: 'inherit' }}>
          {label}
        </span>
      </div>
      <Icon name="chevron-right" size={12} />
    </button>
  )
}

function relativeTime(iso: string): string {
  const dt = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.floor((now - dt) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d ago`
  return new Date(iso).toLocaleDateString()
}
