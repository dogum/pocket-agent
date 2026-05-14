import type { Session } from '@shared/index'

export interface SessionsSurfaceProps {
  activeSessions: Session[]
  archivedSessions: Session[]
  showArchived: boolean
  creating: boolean
  name: string
  description: string
  onShowActive: () => void
  onShowArchived: () => void
  onOpen: (session: Session) => void
  onMenu: (session: Session) => void
  onCreateStart: () => void
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onCreate: () => void
  onCancelCreate: () => void
}

export type SessionSurfaceVariant =
  | 'journal'
  | 'edition'
  | 'observatory'
  | 'workbench'
  | 'atrium'
