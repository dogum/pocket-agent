import type { JSX } from 'react'

import { SessionListSurface } from './shared'
import type { SessionsSurfaceProps } from './types'

interface Props extends SessionsSurfaceProps {
  sessionNoun: string
  pluralNoun: string
}

export function ObservatorySessions(props: Props): JSX.Element {
  return (
    <SessionListSurface
      {...props}
      variant="observatory"
      eyebrow="constellation index"
      headline="Your"
      body="Each constellation is a long-running field the agent keeps under observation."
      createLabel="New constellation"
      emptyActiveTitle="No active constellations"
      emptyArchivedTitle="No archived constellations"
    />
  )
}
