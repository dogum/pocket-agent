// Device frame, status bar, scan bar, bottom nav, screen header.
// All ported from the prototype's shell.jsx — no behavior change.

import type { ReactNode, JSX } from 'react'

import { useSettings } from '../../store/useSettings'
import { Icon, type IconName } from '../icons/Icon'

// ─── Device frame ────────────────────────────────────────────────────
export function Device({
  children,
  time,
}: {
  children: ReactNode
  time?: string
}): JSX.Element {
  const grain = useSettings((s) => s.grain)
  return (
    <div className="device" data-screen-label="Device">
      {grain && <div className="grain" />}
      <StatusBar time={time} />
      <div className="screen-layer">{children}</div>
    </div>
  )
}

// ─── Status bar (with notch) ─────────────────────────────────────────
export function StatusBar({ time = '9:41' }: { time?: string }): JSX.Element {
  return (
    <div className="status-bar">
      <span>{time}</span>
      <div className="device-notch" />
      <div className="right">
        <span
          style={{
            width: 16,
            height: 8,
            borderRadius: 1,
            border: '1px solid var(--text-2)',
            position: 'relative',
            display: 'inline-block',
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 1,
              background: 'var(--text-2)',
              width: '70%',
              borderRadius: '0.5px',
            }}
          />
        </span>
      </div>
    </div>
  )
}

// ─── Scan bar — primary signature motion ─────────────────────────────
export type ScanState = 'ingesting' | 'thinking' | 'drafting' | 'watching'

export function ScanBar({
  state = 'ingesting',
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
  const cls = 'scan-bar' + (compact ? ' compact' : '') + ' state-' + state
  return (
    <div className={cls}>
      <div className="grid-bg" />
      {state === 'ingesting' && <div className="sweep" />}
      {state === 'thinking' && (
        <div className="sweep" style={{ animationDuration: '4s', opacity: 0.6 }} />
      )}
      {state === 'drafting' && (
        <div className="sweep" style={{ animationDuration: '1.6s' }} />
      )}
      <StateBadge state={state} />
      <div className="scan-text">
        {text && <strong>{text}</strong>}
        {detail && <> — {detail}</>}
        {state === 'drafting' && <span className="caret" />}
      </div>
      {readout && <span className="scan-readout">{readout}</span>}
    </div>
  )
}

export function StateBadge({ state }: { state: ScanState }): JSX.Element {
  switch (state) {
    case 'thinking':
      return (
        <div className="phosphor">
          <span />
          <span />
          <span />
        </div>
      )
    case 'drafting':
      return <div className="scan-dot" style={{ background: 'var(--signal)' }} />
    case 'watching':
      return <div className="watch-ring" />
    case 'ingesting':
    default:
      return <div className="scan-dot" />
  }
}

// ─── Bottom nav with FAB ─────────────────────────────────────────────
export type NavTab = 'feed' | 'sessions' | 'search' | 'profile'

export function BottomNav({
  current,
  onNav,
  onIngest,
}: {
  current: NavTab | null
  onNav: (tab: NavTab) => void
  onIngest: () => void
}): JSX.Element {
  return (
    <div className="nav">
      <button
        className={'nav-btn' + (current === 'feed' ? ' active' : '')}
        onClick={() => onNav('feed')}
        title="Feed"
        type="button"
      >
        <Icon name="home" />
      </button>
      <button
        className={'nav-btn' + (current === 'sessions' ? ' active' : '')}
        onClick={() => onNav('sessions')}
        title="Sessions"
        type="button"
      >
        <Icon name="orbit" />
      </button>
      <button className="nav-fab" onClick={onIngest} title="Ingest" type="button">
        <Icon name="plus" size={22} />
      </button>
      <button
        className={'nav-btn' + (current === 'search' ? ' active' : '')}
        onClick={() => onNav('search')}
        title="Search"
        type="button"
      >
        <Icon name="search" />
      </button>
      <button
        className={'nav-btn' + (current === 'profile' ? ' active' : '')}
        onClick={() => onNav('profile')}
        title="Profile"
        type="button"
      >
        <Icon name="user" />
      </button>
    </div>
  )
}

// ─── Screen head (back chevron + title + menu) ───────────────────────
export function ScreenHead({
  onBack,
  title,
}: {
  onBack: () => void
  title: string
}): JSX.Element {
  return (
    <div className="screen-head">
      <button className="icon-btn" onClick={onBack} type="button">
        <Icon name="chevron-left" />
      </button>
      <span className="title">{title}</span>
      <button className="icon-btn" type="button">
        <Icon name="menu" />
      </button>
    </div>
  )
}

// ─── Status row glyph wrapper (for status_list rows in feed) ─────────
export function StatusGlyph({ name }: { name: IconName }): JSX.Element {
  return (
    <div className="glyph">
      <Icon name={name} size={14} />
    </div>
  )
}
