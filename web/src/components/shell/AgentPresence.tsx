import type { JSX } from 'react'

import { EXPERIENCES } from '../../design/experience'
import { useResolvedExperience } from '../../design/useExperience'
import { ScanBar, StateBadge, type ScanState } from './Shell'

export function AgentPresence({
  state = 'thinking',
  text,
  detail,
  readout,
  compact = false,
}: {
  state?: ScanState
  text?: string
  detail?: string
  readout?: string
  compact?: boolean
}): JSX.Element {
  const experience = useResolvedExperience()
  const fallbackText = text ?? EXPERIENCES[experience].agentPresenceLabel

  if (experience === 'field_journal') {
    return (
      <PresenceShell
        kind="journal"
        state={state}
        text={fallbackText}
        detail={detail}
        readout={readout}
        compact={compact}
      />
    )
  }

  if (experience === 'daily_edition') {
    return (
      <PresenceShell
        kind="wire"
        state={state}
        text={fallbackText}
        detail={detail}
        readout={readout}
        compact={compact}
      />
    )
  }

  if (experience === 'workbench') {
    return (
      <PresenceShell
        kind="bench"
        state={state}
        text={fallbackText}
        detail={detail}
        readout={readout}
        compact={compact}
      />
    )
  }

  if (experience === 'quiet_atrium') {
    return (
      <PresenceShell
        kind="atrium"
        state={state}
        text={fallbackText}
        detail={detail}
        readout={readout}
        compact={compact}
      />
    )
  }

  return (
    <ScanBar
      state={state}
      text={fallbackText}
      detail={detail}
      readout={readout}
      compact={compact}
    />
  )
}

function PresenceShell({
  kind,
  state,
  text,
  detail,
  readout,
  compact,
}: {
  kind: 'journal' | 'wire' | 'bench' | 'atrium'
  state: ScanState
  text: string
  detail?: string
  readout?: string
  compact?: boolean
}): JSX.Element {
  return (
    <div
      className={
        `agent-presence presence-${kind} state-${state}` +
        (compact ? ' compact' : '')
      }
    >
      <div className="presence-mark">
        <StateBadge state={state} />
      </div>
      <div className="presence-copy">
        <strong>{text}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {readout && <span className="presence-readout">{readout}</span>}
    </div>
  )
}
