import type { JSX } from 'react'

import { EXPERIENCES } from '../../design/experience'
import { useResolvedExperience } from '../../design/useExperience'
import { AtriumSessions } from './AtriumSessions'
import { EditionSessions } from './EditionSessions'
import { JournalSessions } from './JournalSessions'
import { ObservatorySessions } from './ObservatorySessions'
import { WorkbenchSessions } from './WorkbenchSessions'
import type { SessionsSurfaceProps } from './types'
import { pluralize } from './utils'

export function SessionsSurface(props: SessionsSurfaceProps): JSX.Element {
  const experience = useResolvedExperience()
  const definition = EXPERIENCES[experience]
  const sessionNoun = definition.sessionNoun
  const pluralNoun = pluralize(sessionNoun)

  switch (experience) {
    case 'field_journal':
      return (
        <JournalSessions
          {...props}
          sessionNoun={sessionNoun}
          pluralNoun={pluralNoun}
        />
      )
    case 'daily_edition':
      return (
        <EditionSessions
          {...props}
          sessionNoun={sessionNoun}
          pluralNoun={pluralNoun}
        />
      )
    case 'workbench':
      return (
        <WorkbenchSessions
          {...props}
          sessionNoun={sessionNoun}
          pluralNoun={pluralNoun}
        />
      )
    case 'quiet_atrium':
      return (
        <AtriumSessions
          {...props}
          sessionNoun={sessionNoun}
          pluralNoun={pluralNoun}
        />
      )
    case 'observatory':
    default:
      return (
        <ObservatorySessions
          {...props}
          sessionNoun={sessionNoun}
          pluralNoun={pluralNoun}
        />
      )
  }
}
