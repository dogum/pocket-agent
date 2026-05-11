// "Reading the agent" — the four scan-bar motions, labeled. Helps users
// trust what they're seeing in the feed.

import type { JSX } from 'react'

import { ScanBar, ScreenHead, type ScanState } from '../components/shell/Shell'
import { useAppStore } from '../store/useAppStore'

interface StateCard {
  state: ScanState
  name: string
  tag: string
  motion: string
  when: string
  text: string
  detail: string
  readout: string
}

const CARDS: StateCard[] = [
  {
    state: 'ingesting',
    name: 'Ingesting',
    tag: '01 · receiving',
    motion:
      'A teal sweep travels left → right across a thin grid lattice. A pulsing dot anchors the start.',
    when: 'When new input has just arrived and the agent is reading it.',
    text: 'Reading',
    detail: 'Tempo run · Garmin',
    readout: 'T+ 00:04',
  },
  {
    state: 'thinking',
    name: 'Thinking',
    tag: '02 · reasoning',
    motion:
      'Three phosphor cells pulse in sequence — slower, contemplative. The sweep dims to nearly nothing.',
    when: 'When the agent is mid-reasoning. Often accompanies multi-step tool use.',
    text: 'Reasoning',
    detail: 'comparing 7 long runs · drawing tapering curve',
    readout: 'T+ 02:47',
  },
  {
    state: 'drafting',
    name: 'Drafting',
    tag: '03 · composing',
    motion:
      'A blinking caret advances inside the text run. The sweep cycles fast — the agent is committing words to surface.',
    when: 'When the agent is actively writing or composing the artifact text.',
    text: 'Drafting summary',
    detail: 'paragraph 2 of 3',
    readout: 'T+ 03:12',
  },
  {
    state: 'watching',
    name: 'Watching',
    tag: '04 · standby',
    motion:
      'A breathing ring with a slow inner heartbeat. No sweep — quiet vigilance.',
    when: 'When the agent is between active work, monitoring triggers (schedule, threshold, next ingest).',
    text: 'Watching',
    detail: 'next trigger in 47 min',
    readout: 'last check 2m ago',
  },
]

export function AgentStatesScreen(): JSX.Element {
  const back = useAppStore((s) => s.back)

  return (
    <div
      className="screen enter"
      data-screen-label="Agent states"
      style={{ paddingBottom: 120 }}
    >
      <ScreenHead onBack={back} title="Reading the agent" />
      <div
        style={{ padding: 'var(--space-sm) var(--screen-pad) var(--space-md)' }}
        className="rise"
      >
        <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 6 }}>
          motion · agent presence
        </div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 32,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            fontWeight: 400,
            marginBottom: 8,
          }}
        >
          The agent has <em>four moods</em>.
        </h1>
        <p className="t-body-sm">
          Each long-running state has its own scanning motion. Together they
          form a quiet but legible vocabulary of presence — the brand's
          signature.
        </p>
      </div>

      <div
        style={{
          padding: '0 var(--screen-pad)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {CARDS.map((c) => (
          <div key={c.state} className="card rise" style={{ padding: 16 }}>
            <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 6 }}>
              {c.tag}
            </div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: '-0.01em',
                marginBottom: 12,
              }}
            >
              {c.name}
            </div>
            <ScanBar
              state={c.state}
              text={c.text}
              detail={c.detail}
              readout={c.readout}
            />
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div>
                <div className="t-tag" style={{ marginBottom: 3 }}>Motion</div>
                <div className="t-body-sm">{c.motion}</div>
              </div>
              <div>
                <div className="t-tag" style={{ marginBottom: 3 }}>When</div>
                <div className="t-body-sm">{c.when}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
