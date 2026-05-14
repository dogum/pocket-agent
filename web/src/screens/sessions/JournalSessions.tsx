import type { JSX } from 'react'

import { SessionListSurface } from './shared'
import type { SessionsSurfaceProps } from './types'

interface Props extends SessionsSurfaceProps {
  sessionNoun: string
  pluralNoun: string
}

export function JournalSessions(props: Props): JSX.Element {
  return (
    <SessionListSurface
      {...props}
      variant="journal"
      eyebrow="shelf register"
      headline="Your"
      body="Volumes collect observations over time, with margins for what changed and what still needs watching."
      createLabel="New volume"
      emptyActiveTitle="No open volumes"
      emptyArchivedTitle="No shelved volumes"
    />
  )
}
