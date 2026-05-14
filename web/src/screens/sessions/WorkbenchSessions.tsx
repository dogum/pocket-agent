import type { JSX } from 'react'

import { SessionListSurface } from './shared'
import type { SessionsSurfaceProps } from './types'

interface Props extends SessionsSurfaceProps {
  sessionNoun: string
  pluralNoun: string
}

export function WorkbenchSessions(props: Props): JSX.Element {
  return (
    <SessionListSurface
      {...props}
      variant="workbench"
      eyebrow="project rack"
      headline="Your"
      body="Projects show the agent's current work state: intake, running, review, or shipped."
      createLabel="New project"
      emptyActiveTitle="No active projects"
      emptyArchivedTitle="No parked projects"
    />
  )
}
