import type { JSX } from 'react'

import { SessionListSurface } from './shared'
import type { SessionsSurfaceProps } from './types'

interface Props extends SessionsSurfaceProps {
  sessionNoun: string
  pluralNoun: string
}

export function EditionSessions(props: Props): JSX.Element {
  return (
    <SessionListSurface
      {...props}
      variant="edition"
      eyebrow="beat desk"
      headline="Your"
      body="Beats keep the agent filing dispatches from distinct corners of your life."
      createLabel="New beat"
      emptyActiveTitle="No active beats"
      emptyArchivedTitle="No retired beats"
    />
  )
}
