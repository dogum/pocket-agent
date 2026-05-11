// Agent triggers — schedule prompts that fire on cron expressions per
// session. The server-side scheduler executes them; this screen edits
// the rules that drive it.

import { useEffect, useMemo, useState, type JSX } from 'react'

import type { Session, Trigger } from '@shared/index'
import { Icon } from '../components/icons/Icon'
import { ScreenHead } from '../components/shell/Shell'
import { api } from '../lib/api'
import { useAppStore } from '../store/useAppStore'
import { confirm as confirmDialog } from '../store/useConfirm'

const PRESETS: Array<{ label: string; expr: string; desc: string }> = [
  { label: 'Every morning · 8am', expr: '0 8 * * *', desc: 'Daily 08:00' },
  { label: 'Every hour', expr: '0 * * * *', desc: 'Top of every hour' },
  { label: 'Weekday mornings', expr: '0 8 * * 1-5', desc: 'Mon–Fri 08:00' },
  { label: 'Friday afternoon', expr: '0 16 * * 5', desc: 'Fri 16:00' },
  { label: 'Every minute (testing)', expr: '* * * * *', desc: 'Once per minute' },
]

interface TriggerWithSession extends Trigger {
  sessionId: string
  sessionName: string
}

export function TriggersScreen(): JSX.Element {
  const back = useAppStore((s) => s.back)
  const sessions = useAppStore((s) => s.sessions)

  const [byId, setById] = useState<Record<string, Trigger[]>>({})
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<{
    sessionId: string
    trigger?: Trigger
  } | null>(null)

  const reload = async (): Promise<void> => {
    setLoading(true)
    try {
      const next: Record<string, Trigger[]> = {}
      await Promise.all(
        sessions.map(async (s) => {
          const { triggers } = await api.listTriggers(s.id)
          next[s.id] = triggers
        }),
      )
      setById(next)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.map((s) => s.id).join(',')])

  const all: TriggerWithSession[] = useMemo(() => {
    const out: TriggerWithSession[] = []
    for (const s of sessions) {
      for (const t of byId[s.id] ?? []) {
        out.push({ ...t, sessionId: s.id, sessionName: s.name })
      }
    }
    return out
  }, [byId, sessions])

  return (
    <div className="screen enter" data-screen-label="Triggers">
      <ScreenHead onBack={back} title="Agent triggers" />

      <div style={{ padding: '0 var(--screen-pad)' }} className="rise">
        <div className="t-tag" style={{ marginBottom: 6 }}>Scheduled work</div>
        <h1 className="t-headline" style={{ marginBottom: 8 }}>
          The agent works <em>without you</em>
        </h1>
        <p className="t-body-sm" style={{ marginBottom: 22 }}>
          Cron-style schedules per session. When a trigger fires, the agent
          receives the prompt as a virtual ingest and produces an artifact.
        </p>

        {sessions.length === 0 ? (
          <div className="t-body-sm" style={{ color: 'var(--text-3)' }}>
            Create a session first — triggers attach to one.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 16,
              }}
            >
              {loading && all.length === 0 && (
                <div className="t-caption" style={{ color: 'var(--text-3)' }}>
                  Loading triggers…
                </div>
              )}
              {!loading && all.length === 0 && (
                <div
                  className="card bordered"
                  style={{ padding: 14, color: 'var(--text-3)' }}
                >
                  <div className="t-body-sm" style={{ color: 'var(--text)' }}>
                    No triggers yet
                  </div>
                  <div className="t-caption" style={{ marginTop: 4 }}>
                    Pick a session below and add one.
                  </div>
                </div>
              )}
              {all.map((t) => (
                <TriggerCard
                  key={t.id}
                  t={t}
                  onEdit={() =>
                    setEditor({ sessionId: t.sessionId, trigger: t })
                  }
                  onToggle={async (enabled) => {
                    await api.updateTrigger(t.sessionId, t.id, { enabled })
                    void reload()
                  }}
                  onDelete={async () => {
                    const ok = await confirmDialog({
                      title: 'Delete this trigger?',
                      body: 'The schedule stops and the rule is removed. Other triggers in this session are unaffected.',
                      confirmLabel: 'Delete',
                      destructive: true,
                    })
                    if (!ok) return
                    await api.deleteTrigger(t.sessionId, t.id)
                    void reload()
                  }}
                />
              ))}
            </div>

            <div className="t-tag" style={{ marginBottom: 8 }}>Add to session</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chip"
                  onClick={() => setEditor({ sessionId: s.id })}
                  style={{ cursor: 'pointer', padding: '6px 12px' }}
                >
                  + {s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {editor && (
        <TriggerEditor
          sessionId={editor.sessionId}
          sessionName={
            sessions.find((s) => s.id === editor.sessionId)?.name ?? ''
          }
          trigger={editor.trigger}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await reload()
          }}
        />
      )}
    </div>
  )
}

function TriggerCard({
  t,
  onEdit,
  onToggle,
  onDelete,
}: {
  t: TriggerWithSession
  onEdit: () => void
  onToggle: (v: boolean) => void
  onDelete: () => void
}): JSX.Element {
  const enabled = t.enabled !== false
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <div>
          <div className="t-tag" style={{ color: 'var(--signal)' }}>
            {t.sessionName}
          </div>
          <div
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 17,
              lineHeight: 1.2,
            }}
          >
            {t.description || 'Untitled trigger'}
          </div>
        </div>
        <span className="chip" style={{ padding: '3px 9px' }}>
          {t.schedule}
        </span>
      </div>
      <div
        className="t-body-sm"
        style={{ color: 'var(--text-2)', marginBottom: 10 }}
      >
        {t.prompt.length > 200 ? `${t.prompt.slice(0, 200)}…` : t.prompt}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 10,
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <div className="t-caption">
          {t.last_fired_at
            ? `Last fired ${relTime(t.last_fired_at)}`
            : 'Never fired yet'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="chip"
            onClick={() => onToggle(!enabled)}
            style={{
              cursor: 'pointer',
              padding: '4px 10px',
              background: enabled ? 'var(--signal-dim)' : 'var(--surface-2)',
              color: enabled ? 'var(--signal)' : 'var(--text-3)',
            }}
          >
            {enabled ? 'enabled' : 'paused'}
          </button>
          <button
            type="button"
            className="chip"
            style={{ cursor: 'pointer', padding: '4px 10px' }}
            onClick={onEdit}
          >
            edit
          </button>
          <button
            type="button"
            className="chip"
            style={{
              cursor: 'pointer',
              padding: '4px 10px',
              color: 'var(--red)',
            }}
            onClick={onDelete}
          >
            delete
          </button>
        </div>
      </div>
    </div>
  )
}

function TriggerEditor({
  sessionId,
  sessionName,
  trigger,
  onClose,
  onSaved,
}: {
  sessionId: string
  sessionName: string
  trigger?: Trigger
  onClose: () => void
  onSaved: () => Promise<void> | void
}): JSX.Element {
  const [schedule, setSchedule] = useState(trigger?.schedule ?? '0 8 * * *')
  const [description, setDescription] = useState(trigger?.description ?? '')
  const [prompt, setPrompt] = useState(trigger?.prompt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    if (busy) return
    setError(null)
    if (!schedule.trim() || !prompt.trim()) {
      setError('Schedule and prompt are required.')
      return
    }
    setBusy(true)
    try {
      if (trigger) {
        await api.updateTrigger(sessionId, trigger.id, {
          schedule: schedule.trim(),
          description: description.trim(),
          prompt: prompt.trim(),
        })
      } else {
        await api.createTrigger(sessionId, {
          schedule: schedule.trim(),
          description: description.trim(),
          prompt: prompt.trim(),
        })
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="handle" />
        <div className="body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 14,
            }}
          >
            <div className="t-tag">
              {trigger ? 'Edit trigger' : 'New trigger'} · {sessionName}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="t-tag" style={{ marginBottom: 6 }}>Schedule</div>
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 8 * * *"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--surface-2)',
                borderRadius: 10,
                fontFamily: 'var(--mono)',
                fontSize: 13,
                color: 'var(--text)',
                marginBottom: 8,
              }}
            />
            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
            >
              {PRESETS.map((p) => (
                <button
                  key={p.expr}
                  type="button"
                  className="chip"
                  style={{ cursor: 'pointer', padding: '4px 9px' }}
                  onClick={() => setSchedule(p.expr)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div className="t-tag" style={{ marginBottom: 6 }}>Description</div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Morning training summary"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--surface-2)',
                borderRadius: 10,
                fontSize: 13,
                color: 'var(--text)',
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <div className="t-tag" style={{ marginBottom: 6 }}>Prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              placeholder="Summarize the last 24 hours of training. Flag anything that needs my attention before today's session."
              style={{
                width: '100%',
                padding: 12,
                background: 'var(--surface-2)',
                borderRadius: 10,
                fontSize: 13,
                color: 'var(--text)',
                resize: 'vertical',
              }}
            />
          </div>

          {error && (
            <div
              className="t-body-sm"
              style={{ color: 'var(--red)', marginBottom: 10 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              onClick={save}
              disabled={busy}
            >
              {busy ? 'Saving…' : trigger ? 'Save changes' : 'Create trigger'}
            </button>
            <button type="button" className="btn outline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function relTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

// Compile-time guard: keep the local Session type in sync with shared.
const _typecheck: Session | null = null as Session | null
void _typecheck
