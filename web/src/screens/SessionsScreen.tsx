import { useEffect, useState, type ComponentProps, type JSX } from 'react'

import type { Session } from '@shared/index'
import { Icon } from '../components/icons/Icon'
import { api } from '../lib/api'
import { SessionsSurface } from './sessions/SessionsSurface'
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

  const onCancelCreate = (): void => {
    setCreating(false)
    setName('')
    setDescription('')
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
      <SessionsSurface
        activeSessions={sessions}
        archivedSessions={archived}
        showArchived={showArchived}
        creating={creating}
        name={name}
        description={description}
        onShowActive={() => setShowArchived(false)}
        onShowArchived={() => setShowArchived(true)}
        onOpen={(session) => go({ name: 'session', id: session.id })}
        onMenu={setMenuFor}
        onCreateStart={() => setCreating(true)}
        onNameChange={setName}
        onDescriptionChange={setDescription}
        onCreate={() => void onCreate()}
        onCancelCreate={onCancelCreate}
      />

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
  icon: ComponentProps<typeof Icon>['name']
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
