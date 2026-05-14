// First-run / replayed onboarding. Five-step cinematic ported from the
// prototype (screens-3.jsx:109-346). Final step lands the user with a
// named session — or, if they're replaying, lets them skip out clean.

import { useState, type JSX } from 'react'

import { Icon, type IconName } from '../components/icons/Icon'
import { AgentPresence } from '../components/shell/AgentPresence'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

const TOTAL = 5

const SUGGESTIONS: Array<{ name: string; description: string }> = [
  { name: 'Marathon training', description: 'Pace, recovery, race plan' },
  { name: 'Home renovation', description: 'Bids, schedule, change orders' },
  { name: 'Dissertation Ch.4', description: 'Methodology + lit review' },
  { name: 'Job search', description: 'Applications, prep, threads' },
]

export function OnboardingScreen(): JSX.Element {
  const setRoot = useAppStore((s) => s.setRoot)
  const upsert = useAppStore((s) => s.upsertSession)
  const sessions = useAppStore((s) => s.sessions)
  const isReplay = sessions.length > 0

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = (): void => setStep((s) => Math.min(TOTAL - 1, s + 1))
  const back = (): void => setStep((s) => Math.max(0, s - 1))

  const finish = async (): Promise<void> => {
    if (creating) return
    setError(null)

    if (isReplay && !name.trim()) {
      // Replaying with no name typed — just dismiss to feed.
      setRoot({ name: 'feed' })
      return
    }
    if (!name.trim()) {
      setError('Give your first session a name.')
      return
    }
    setCreating(true)
    try {
      const session = await api.createSession({
        name: name.trim(),
        description: description.trim() || undefined,
      })
      upsert(session)
      setRoot({ name: 'feed' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCreating(false)
    }
  }

  const finalStep = step === TOTAL - 1

  return (
    <div
      className="screen enter"
      data-screen-label="Onboarding"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        position: 'relative',
      }}
    >
      {/* progress bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '14px var(--screen-pad)',
        }}
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 2,
              borderRadius: 1,
              background:
                i <= step ? 'var(--signal)' : 'var(--surface-3)',
              transition: 'background 0.4s',
            }}
          />
        ))}
      </div>

      <div style={{ flex: 1, padding: 'var(--space-md) var(--screen-pad) 0' }}>
        {step === 0 && <Step0 />}
        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}
        {step === 4 && (
          <Step4
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            error={error}
            isReplay={isReplay}
          />
        )}
      </div>

      <div
        style={{
          padding: 'var(--space-md) var(--screen-pad) calc(var(--space-lg) + 8px)',
          display: 'flex',
          gap: 8,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {step > 0 && (
          <button
            type="button"
            className="btn outline"
            onClick={back}
            disabled={creating}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="btn primary"
          onClick={finalStep ? () => void finish() : next}
          style={{ flex: 1 }}
          disabled={creating}
        >
          {creating
            ? 'Creating…'
            : finalStep
              ? isReplay && !name.trim()
                ? 'Done'
                : 'Begin observing'
              : step === 0
                ? 'Start'
                : 'Continue'}
          {!finalStep && <Icon name="chevron-right" size={12} />}
        </button>
      </div>
    </div>
  )
}

// ─── Steps ─────────────────────────────────────────────────────────

function Step0(): JSX.Element {
  return (
    <div
      className="rise"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          minHeight: 280,
        }}
      >
        <ObservatoryLogo />
      </div>
      <div style={{ paddingBottom: 12 }}>
        <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 10 }}>
          Pocket Agent
        </div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 38,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 400,
            marginBottom: 14,
          }}
        >
          You bring <em>signals</em>.<br />The agent watches.
        </h1>
        <p className="t-body" style={{ color: 'var(--text-2)' }}>
          Send anything — text, files, links. The agent works in the
          background, then surfaces what matters as interactive artifacts.
        </p>
      </div>
    </div>
  )
}

function ObservatoryLogo(): JSX.Element {
  return (
    <div style={{ position: 'relative', width: 200, height: 200 }}>
      <svg
        viewBox="0 0 200 200"
        style={{
          position: 'absolute',
          inset: 0,
          animation: 'spin 60s linear infinite',
        }}
      >
        <circle cx="100" cy="100" r="92" fill="none" stroke="var(--signal)" strokeWidth="0.5" strokeDasharray="2 4" opacity="0.5" />
        <circle cx="100" cy="100" r="74" fill="none" stroke="var(--signal)" strokeWidth="0.5" opacity="0.3" />
        <circle cx="100" cy="100" r="56" fill="none" stroke="var(--cool)" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4" />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2
          const x1 = 100 + Math.cos(a) * 88
          const y1 = 100 + Math.sin(a) * 88
          const x2 = 100 + Math.cos(a) * 92
          const y2 = 100 + Math.sin(a) * 92
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--signal)"
              strokeWidth="0.5"
              opacity={i % 6 === 0 ? 0.8 : 0.3}
            />
          )
        })}
        <text x="100" y="14" textAnchor="middle" fontFamily="var(--mono)" fontSize="7" fill="var(--text-3)" letterSpacing="0.2em">N</text>
        <text x="100" y="194" textAnchor="middle" fontFamily="var(--mono)" fontSize="7" fill="var(--text-3)" letterSpacing="0.2em">S</text>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 50,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 40%, rgba(92,184,178,0.3), rgba(10,16,20,0.9))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--signal)',
            boxShadow: '0 0 32px var(--signal-glow)',
          }}
        />
      </div>
    </div>
  )
}

function Step1(): JSX.Element {
  const inputs: Array<{ icon: IconName; label: string; desc: string }> = [
    { icon: 'pen', label: 'Text', desc: 'free-form notes — the agent figures out where it goes' },
    { icon: 'link', label: 'Link', desc: 'any URL — articles, video, social' },
    { icon: 'file', label: 'File', desc: 'PDFs, CSVs, video, anything' },
    { icon: 'photo', label: 'Photo', desc: 'scan a label, capture a moment' },
  ]
  return (
    <div className="rise">
      <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 8 }}>
        01 / Ingest
      </div>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 30,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontWeight: 400,
          marginBottom: 18,
        }}
      >
        Send <em>anything</em>.
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {inputs.map((it, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--surface-2)',
                color: 'var(--signal)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={it.icon} size={14} />
            </span>
            <div style={{ flex: 1 }}>
              <div className="t-body" style={{ color: 'var(--text)' }}>
                {it.label}
              </div>
              <div className="t-caption">{it.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step2(): JSX.Element {
  return (
    <div className="rise">
      <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 8 }}>
        02 / Sessions
      </div>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 30,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontWeight: 400,
          marginBottom: 14,
        }}
      >
        Long-running <em>contexts</em>.
      </h2>
      <p className="t-body" style={{ color: 'var(--text-2)', marginBottom: 22 }}>
        Each ongoing project, training plan, or investigation is a session.
        The agent maintains memory across weeks or months — and you can
        schedule it to wake on its own.
      </p>

      <div
        style={{
          position: 'relative',
          height: 220,
          background: 'var(--surface-1)',
          borderRadius: 14,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <svg viewBox="0 0 320 220" style={{ width: '100%', height: '100%' }}>
          <circle cx="160" cy="110" r="44" fill="none" stroke="var(--signal)" strokeWidth="0.5" opacity="0.5" />
          <circle cx="160" cy="110" r="74" fill="none" stroke="var(--cool)" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
          <circle cx="160" cy="110" r="100" fill="none" stroke="var(--text-4)" strokeWidth="0.5" strokeDasharray="1 4" opacity="0.4" />
          <circle cx="160" cy="110" r="6" fill="var(--signal)" />
          <circle cx="204" cy="110" r="5" fill="var(--bg)" stroke="var(--signal)" strokeWidth="1.5" />
          <text x="216" y="113" fontFamily="var(--mono)" fontSize="9" fill="var(--text-2)" letterSpacing="0.05em">marathon</text>
          <circle cx="116" cy="84" r="5" fill="var(--bg)" stroke="var(--cool)" strokeWidth="1.5" />
          <text x="60" y="87" fontFamily="var(--mono)" fontSize="9" fill="var(--text-2)" letterSpacing="0.05em">research</text>
          <circle cx="106" cy="142" r="5" fill="var(--bg)" stroke="var(--text-3)" strokeWidth="1.5" />
          <text x="36" y="146" fontFamily="var(--mono)" fontSize="9" fill="var(--text-2)" letterSpacing="0.05em">recipes</text>
          <circle cx="220" cy="48" r="4" fill="var(--bg)" stroke="var(--text-3)" strokeWidth="1.5" />
          <text x="226" y="51" fontFamily="var(--mono)" fontSize="9" fill="var(--text-3)" letterSpacing="0.05em">trip</text>
        </svg>
      </div>

      <p className="t-body-sm" style={{ color: 'var(--text-3)' }}>
        Each ingest routes itself to the right session. Triggers (set later)
        let the agent fire on a schedule even when you're not there.
      </p>
    </div>
  )
}

function Step3(): JSX.Element {
  return (
    <div className="rise">
      <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 8 }}>
        03 / Artifacts
      </div>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 30,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontWeight: 400,
          marginBottom: 14,
        }}
      >
        Composed for <em>you</em>.
      </h2>
      <p className="t-body" style={{ color: 'var(--text-2)', marginBottom: 18 }}>
        The agent surfaces results as artifacts — built from a library of
        nineteen components, arranged for the moment.
      </p>

      <div className="card" style={{ padding: 14, marginBottom: 8 }}>
        <div className="c-data-row">
          <div className="cell">
            <span className="v">42.2</span>
            <span className="l">target km</span>
          </div>
          <div className="cell">
            <span className="v signal">3:42</span>
            <span className="l">goal pace</span>
          </div>
          <div className="cell">
            <span className="v cool">w/ 8</span>
            <span className="l">of 16</span>
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 14, marginBottom: 8 }}>
        <div className="t-tag" style={{ marginBottom: 8 }}>
          last 14 days · weekly km
        </div>
        <svg
          viewBox="0 0 240 50"
          preserveAspectRatio="none"
          style={{ width: '100%', height: 50 }}
        >
          <path
            d="M0,40 L20,32 L40,38 L60,28 L80,22 L100,30 L120,18 L140,24 L160,12 L180,18 L200,8 L220,14 L240,10"
            fill="none"
            stroke="var(--signal)"
            strokeWidth="1.5"
          />
          <path
            d="M0,40 L20,32 L40,38 L60,28 L80,22 L100,30 L120,18 L140,24 L160,12 L180,18 L200,8 L220,14 L240,10 L240,50 L0,50 Z"
            fill="var(--signal)"
            opacity="0.1"
          />
        </svg>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <AgentPresence
          state="thinking"
          text="Reasoning"
          detail="comparing 7 long runs · drawing tapering curve"
          readout="T+ 02:47"
          compact
        />
      </div>

      <p
        className="t-caption"
        style={{ marginTop: 14, textAlign: 'center', color: 'var(--text-3)' }}
      >
        The scan-bar tells you what the agent's doing. Reading the agent
        lives in your Profile.
      </p>
    </div>
  )
}

function Step4({
  name,
  setName,
  description,
  setDescription,
  error,
  isReplay,
}: {
  name: string
  setName: (v: string) => void
  description: string
  setDescription: (v: string) => void
  error: string | null
  isReplay: boolean
}): JSX.Element {
  return (
    <div className="rise">
      <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 8 }}>
        04 / Begin
      </div>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontSize: 30,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          fontWeight: 400,
          marginBottom: 14,
        }}
      >
        {isReplay ? 'Or add a new <em>session</em>.' : <>Name your first <em>session</em>.</>}
      </h2>
      <p className="t-body-sm" style={{ marginBottom: 14 }}>
        {isReplay
          ? 'Add a new long-running thread, or skip to your feed.'
          : 'Name the long-running thread the agent will work on. You can always create more later.'}
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {SUGGESTIONS.map((s, i) => (
          <button
            type="button"
            key={i}
            className="chip"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setName(s.name)
              setDescription(s.description)
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <input
        autoFocus
        placeholder="Session name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'var(--surface-2)',
          borderRadius: 10,
          fontSize: 16,
          fontFamily: 'var(--serif)',
          color: 'var(--text)',
          marginBottom: 8,
        }}
      />
      <input
        placeholder="One-line description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'var(--surface-2)',
          borderRadius: 10,
          fontSize: 13,
          color: 'var(--text)',
          marginBottom: 14,
        }}
      />

      {error && (
        <div className="t-body-sm" style={{ color: 'var(--red)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
