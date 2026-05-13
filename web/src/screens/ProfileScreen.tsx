import { useEffect, useState, type JSX } from 'react'

import { Icon, type IconName } from '../components/icons/Icon'
import { StatusGlyph } from '../components/shell/Shell'
import { api } from '../lib/api'
import {
  permissionState,
  requestPermission,
  type PermissionState,
} from '../lib/notifications'
import { useAppStore } from '../store/useAppStore'
import {
  type Atmosphere,
  type Density,
  type ThemePreference,
  useSettings,
} from '../store/useSettings'

const ACCENTS: Array<{ hex: string; name: string; note?: string }> = [
  { hex: '#5CB8B2', name: 'Arctic teal', note: 'default' },
  { hex: '#8BA4C4', name: 'Cool steel' },
  { hex: '#D4A574', name: 'Warm sand' },
  { hex: '#C97A6B', name: 'Coral' },
  { hex: '#B8A5D4', name: 'Iris' },
  { hex: '#9BC48B', name: 'Sage' },
]

const THEMES: Array<{ id: ThemePreference; name: string; desc: string; preview: string }> = [
  { id: 'auto', name: 'Auto', desc: 'Follow OS', preview: 'linear-gradient(135deg,#08080A 0%,#08080A 50%,#F4F2ED 50%,#F4F2ED 100%)' },
  { id: 'light', name: 'Dawn', desc: 'Cool ivory, ink type', preview: '#F4F2ED' },
  { id: 'dark', name: 'Night', desc: 'Deep field, cool grain', preview: '#08080A' },
]

const DENSITIES: Array<{ id: Density; name: string; desc: string }> = [
  { id: 'editorial', name: 'Editorial', desc: 'Roomier, larger type' },
  { id: 'balanced', name: 'Balanced', desc: 'Default' },
  { id: 'instrument', name: 'Instrument', desc: 'Tighter, denser data' },
]

const ATMOSPHERES: Array<{ id: Atmosphere; name: string; desc: string }> = [
  { id: 'minimal', name: 'Calm', desc: 'Subtle scans, low chrome' },
  { id: 'signature', name: 'Signature', desc: 'Default Observatory feel' },
  { id: 'intense', name: 'Intense', desc: 'Stronger scans, more presence' },
]

export function ProfileScreen(): JSX.Element {
  const sessions = useAppStore((s) => s.sessions)
  const artifactCount = useAppStore((s) => s.artifacts.length)
  const agentReady = useAppStore((s) => s.agentReady)
  const profile = useAppStore((s) => s.profile)
  const setData = useAppStore((s) => s.setData)
  const setRoot = useAppStore((s) => s.setRoot)
  const go = useAppStore((s) => s.go)

  const settings = useSettings()

  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(profile?.name ?? '')
  const [notifPermission, setNotifPermission] = useState<PermissionState>(
    typeof window === 'undefined' ? 'unsupported' : permissionState(),
  )

  useEffect(() => {
    setDraftName(profile?.name ?? '')
  }, [profile?.name])

  const handleNotificationToggle = async (next: boolean): Promise<void> => {
    if (next && notifPermission !== 'granted') {
      const result = await requestPermission()
      setNotifPermission(result)
      // If the user denied, keep the toggle off — being honest beats a
      // toggle that pretends to be on.
      if (result !== 'granted') {
        settings.set('notifications', false)
        return
      }
    }
    settings.set('notifications', next)
  }

  const notifStatusText = ((): string => {
    if (notifPermission === 'unsupported') return 'Not supported in this browser'
    if (notifPermission === 'denied') return 'Blocked in browser settings'
    if (notifPermission === 'granted')
      return settings.notifications
        ? 'On — you’ll get desktop alerts when the window is hidden'
        : 'Browser permitted — toggle to enable'
    return 'Toggle to enable — your browser will ask permission'
  })()

  const saveName = async (): Promise<void> => {
    const trimmed = draftName.trim()
    const prev = profile?.name ?? ''
    if (trimmed === prev) {
      setEditingName(false)
      return
    }
    try {
      const updated = await api.updateProfile({ name: trimmed })
      setData({ profile: { name: updated.name, stats: updated.stats } })
    } finally {
      setEditingName(false)
    }
  }

  const sourcesCount = profile?.stats.sources ?? 0
  const initial = (profile?.name?.trim()[0] ?? 'O').toUpperCase()
  const displayName = profile?.name?.trim() || 'Observer'

  return (
    <div className="screen enter" data-screen-label="07 Profile">
      {/* ── Identity header ───────────────────────────────────────── */}
      <div
        style={{
          padding: 'var(--space-lg) var(--screen-pad) var(--space-md)',
          textAlign: 'center',
        }}
        className="rise"
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--signal), var(--signal-deep))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontFamily: 'var(--serif)',
            fontWeight: 500,
            color: 'var(--bg)',
            marginBottom: 12,
            boxShadow: '0 4px 24px var(--signal-glow)',
          }}
        >
          {initial}
        </div>
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') {
                setDraftName(profile?.name ?? '')
                setEditingName(false)
              }
            }}
            placeholder="Your name"
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 'var(--t-title)',
              color: 'var(--text)',
              textAlign: 'center',
              padding: '4px 8px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              maxWidth: 240,
              margin: '0 auto',
              display: 'block',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="t-title"
            style={{
              fontFamily: 'var(--serif)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            {displayName}
          </button>
        )}
        <div className="t-caption" style={{ marginTop: 4 }}>
          local workspace
        </div>
        <span
          className={'chip ' + (agentReady ? 'green' : 'amber')}
          style={{ marginTop: 12 }}
        >
          {agentReady ? 'Agent connected' : 'Agent not configured'}
        </span>
      </div>

      <div style={{ padding: '0 var(--screen-pad)' }} className="rise">
        {/* ── Stats ─────────────────────────────────────────────── */}
        <div className="c-data-row" style={{ marginBottom: 22 }}>
          <div className="cell">
            <span className="v signal">{sessions.length}</span>
            <span className="l">Sessions</span>
          </div>
          <div className="cell">
            <span className="v">{artifactCount}</span>
            <span className="l">Artifacts</span>
          </div>
          <div className="cell">
            <span className="v cool">{sourcesCount}</span>
            <span className="l">Sources</span>
          </div>
        </div>

        {/* ── Appearance ────────────────────────────────────────── */}
        <SectionTag>Appearance</SectionTag>

        <SettingCard label="Theme" hint="Observatory at night, dawn, or follow your OS">
          <div style={{ display: 'flex', gap: 6 }}>
            {THEMES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => settings.set('theme', opt.id)}
                className="card tap"
                style={{
                  flex: 1,
                  padding: 12,
                  textAlign: 'left',
                  background:
                    settings.theme === opt.id
                      ? 'var(--signal-dim)'
                      : 'var(--surface-2)',
                  borderLeft:
                    settings.theme === opt.id
                      ? '2px solid var(--signal)'
                      : '2px solid transparent',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: opt.preview,
                      border: '1px solid var(--hairline-strong)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    className="t-body-sm"
                    style={{ color: 'var(--text)' }}
                  >
                    {opt.name}
                  </span>
                </div>
                <div className="t-caption">{opt.desc}</div>
              </button>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          label="Accent"
          hint="Drives the signal color across artifacts and motion"
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ACCENTS.map((a) => (
              <button
                key={a.hex}
                type="button"
                onClick={() => settings.set('accent', a.hex)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: 6,
                  borderRadius: 8,
                  background:
                    settings.accent === a.hex
                      ? 'var(--surface-2)'
                      : 'transparent',
                  minWidth: 64,
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: a.hex,
                    boxShadow:
                      settings.accent === a.hex
                        ? `0 0 0 2px var(--bg), 0 0 0 4px ${a.hex}`
                        : 'none',
                    transition: 'box-shadow 0.15s',
                  }}
                />
                <span
                  className="t-caption"
                  style={{
                    color:
                      settings.accent === a.hex
                        ? 'var(--text)'
                        : 'var(--text-3)',
                    fontSize: 10,
                    lineHeight: 1.1,
                    textAlign: 'center',
                  }}
                >
                  {a.name}
                </span>
              </button>
            ))}
          </div>
        </SettingCard>

        <SettingCard label="Density" hint="How tightly the data packs">
          <RadioRows
            options={DENSITIES}
            value={settings.density}
            onChange={(v) => settings.set('density', v)}
          />
        </SettingCard>

        <SettingCard
          label="Atmosphere"
          hint="How present the agent's motion feels"
        >
          <RadioRows
            options={ATMOSPHERES}
            value={settings.atmosphere}
            onChange={(v) => settings.set('atmosphere', v)}
          />
        </SettingCard>

        {/* ── Preferences ──────────────────────────────────────── */}
        <SectionTag>Preferences</SectionTag>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 22,
          }}
        >
          <ToggleRow
            icon="bell"
            name="Push notifications"
            sub={notifStatusText}
            value={settings.notifications && notifPermission === 'granted'}
            onChange={(v) => void handleNotificationToggle(v)}
          />
          <ToggleRow
            icon="sparkles"
            name="Grain texture"
            sub="Atmospheric noise overlay on the device frame"
            value={settings.grain}
            onChange={(v) => settings.set('grain', v)}
          />
          <NavRow
            icon="lock"
            name="Privacy & data"
            onClick={() => go({ name: 'privacy' })}
          />
          <NavRow
            icon="gear"
            name="Agent triggers"
            onClick={() => go({ name: 'triggers' })}
          />
          <NavRow
            icon="orbit"
            name="Ambient sources"
            onClick={() => go({ name: 'sources' })}
          />
        </div>

        {/* ── Help & reference ─────────────────────────────────── */}
        <SectionTag>Help & reference</SectionTag>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 22,
          }}
        >
          <NavRow
            icon="orbit"
            name="What the agent can render"
            val="24 components"
            onClick={() => go({ name: 'component-library' })}
          />
          <NavRow
            icon="lab"
            name="Showing the work"
            val="30 thinking components"
            onClick={() => go({ name: 'vocabulary-v2' })}
          />
          <NavRow
            icon="sparkles"
            name="Reading the agent"
            val="4 motions"
            onClick={() => go({ name: 'agent-states' })}
          />
          <NavRow
            icon="eye"
            name="Replay onboarding"
            onClick={() => setRoot({ name: 'onboarding' })}
          />
        </div>

        {/* ── About ──────────────────────────────────────────────── */}
        <SectionTag>About</SectionTag>
        <div
          className="card"
          style={{ padding: 14, marginBottom: 22, lineHeight: 1.6 }}
        >
          <div className="t-body-sm" style={{ color: 'var(--text-2)' }}>
            Pocket Agent is a substrate where managed AI agents process
            your inputs and shape the app around what you feed it. The
            longer it runs, the more uniquely yours.
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 12,
              color: 'var(--text-3)',
              fontSize: 11,
              fontFamily: 'var(--mono)',
            }}
          >
            <Icon name="lock" size={11} />
            All data stored locally
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Bits ──────────────────────────────────────────────────────────

function SectionTag({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="t-tag" style={{ marginBottom: 8 }}>
      {children}
    </div>
  )
}

function SettingCard({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 12 }}>
      <div
        className="t-body-sm"
        style={{ color: 'var(--text)', marginBottom: 4 }}
      >
        {label}
      </div>
      {hint && (
        <div className="t-caption" style={{ marginBottom: 10 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  )
}

function RadioRows<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: T; name: string; desc: string }>
  value: T
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className="card tap"
          style={{
            padding: 10,
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: value === o.id ? 'var(--signal-dim)' : 'var(--surface-2)',
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: value === o.id ? 'none' : '1.5px solid var(--text-4)',
              background: value === o.id ? 'var(--signal)' : 'transparent',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div className="t-body-sm" style={{ color: 'var(--text)' }}>
              {o.name}
            </div>
            <div className="t-caption">{o.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function ToggleRow({
  icon,
  name,
  sub,
  value,
  onChange,
}: {
  icon: IconName
  name: string
  sub?: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="status-row"
      onClick={() => onChange(!value)}
      style={{ width: '100%', textAlign: 'left' }}
    >
      <div className="left">
        <StatusGlyph name={icon} />
        <div>
          <div className="t-body-sm" style={{ color: 'var(--text)' }}>
            {name}
          </div>
          {sub && (
            <div className="t-caption" style={{ marginTop: 1 }}>
              {sub}
            </div>
          )}
        </div>
      </div>
      <span
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          background: value ? 'var(--signal)' : 'var(--surface-3)',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: value ? 'var(--bg)' : 'var(--text-2)',
            position: 'absolute',
            top: 3,
            left: value ? 19 : 3,
            transition: 'left 0.2s',
          }}
        />
      </span>
    </button>
  )
}

function NavRow({
  icon,
  name,
  val,
  onClick,
}: {
  icon: IconName
  name: string
  val?: string
  onClick?: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="status-row"
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left' }}
    >
      <div className="left">
        <StatusGlyph name={icon} />
        <span className="name">{name}</span>
      </div>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-3)',
        }}
      >
        {val && <span className="t-caption">{val}</span>}
        <Icon name="chevron-right" size={12} />
      </span>
    </button>
  )
}
