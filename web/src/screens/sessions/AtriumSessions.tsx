import type { JSX } from 'react'

import { SessionListSurface } from './shared'
import type { SessionsSurfaceProps } from './types'

interface Props extends SessionsSurfaceProps {
  sessionNoun: string
  pluralNoun: string
}

export function AtriumSessions(props: Props): JSX.Element {
  return (
    <SessionListSurface
      {...props}
      variant="atrium"
      eyebrow="room board"
      headline="Your"
      body="Rooms hold the shared context you and the agent keep returning to."
      createLabel="New room"
      emptyActiveTitle="No open rooms"
      emptyArchivedTitle="No quiet rooms"
    />
  )
}
