import { useEffect, useState, type JSX } from 'react'

import type {
  CounterComponent,
  ScratchpadComponent,
  TimerComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

export function CTimer({
  id,
  label,
  duration_seconds,
  elapsed_seconds = 0,
  mode = 'countdown',
  completion_prompt,
  onInteraction,
}: TimerComponent & VocabularyRendererProps): JSX.Element {
  const [elapsed, setElapsed] = useState(elapsed_seconds)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(false)
  const duration = Math.max(0, duration_seconds)
  const displaySeconds =
    mode === 'countdown' ? Math.max(0, duration - elapsed) : elapsed

  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => {
      setElapsed((current) => current + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [running])

  useEffect(() => {
    if (completed || mode !== 'countdown' || elapsed < duration || duration === 0) {
      return
    }
    setRunning(false)
    setCompleted(true)
    if (completion_prompt) {
      void onInteraction?.({
        kind: 'timer.complete',
        component_type: 'timer',
        component_id: id,
        payload: { id, label, duration_seconds: duration, completion_prompt },
      })
    }
  }, [
    completed,
    completion_prompt,
    duration,
    elapsed,
    id,
    label,
    mode,
    onInteraction,
  ])

  return (
    <div className="c-timer">
      <div>
        <span className="vocab-label">{label}</span>
        <strong>{formatSeconds(displaySeconds)}</strong>
      </div>
      <div className="timer-actions">
        <button
          type="button"
          className="mini-btn"
          onClick={() => setRunning((value) => !value)}
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => {
            setElapsed(0)
            setCompleted(false)
            setRunning(false)
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}

export function CCounter({
  id,
  label,
  value,
  target,
  unit,
  submit_label,
  onInteraction,
}: CounterComponent & VocabularyRendererProps): JSX.Element {
  const [current, setCurrent] = useState(value)
  const [sent, setSent] = useState(false)
  const pct = target ? Math.max(0, Math.min(100, (current / target) * 100)) : 0

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'counter.submit',
      component_type: 'counter',
      component_id: id,
      payload: { id, label, value: current, target, unit },
    })
  }

  return (
    <div className="c-counter">
      <div className="counter-head">
        <span className="vocab-label">{label}</span>
        <strong>
          {current}
          {target ? ` / ${target}` : ''}
          {unit ? ` ${unit}` : ''}
        </strong>
      </div>
      {target && (
        <div className="track">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="counter-actions">
        <button
          type="button"
          className="mini-btn"
          onClick={() => setCurrent((n) => n - 1)}
        >
          -
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => setCurrent((n) => n + 1)}
        >
          +
        </button>
        <button type="button" className="btn primary" onClick={submit}>
          {sent ? 'Sent' : (submit_label ?? 'Submit')}
        </button>
      </div>
    </div>
  )
}

export function CScratchpad({
  id,
  title,
  content,
  shared_with_agent,
  privacy_note,
  onInteraction,
}: ScratchpadComponent & VocabularyRendererProps): JSX.Element {
  const [value, setValue] = useState(content)
  const [sent, setSent] = useState(false)

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'scratchpad.save',
      component_type: 'scratchpad',
      component_id: id,
      payload: { id, title, content: value, shared_with_agent },
    })
  }

  return (
    <div className="c-scratchpad">
      <div className="scratch-head">
        <span className="vocab-label">{title ?? 'Scratchpad'}</span>
        {shared_with_agent && <span className="share-tag">Shared with agent</span>}
      </div>
      <textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {privacy_note && <p className="privacy">{privacy_note}</p>}
      <button type="button" className="btn primary" onClick={submit}>
        {sent ? 'Sent' : 'Save scratchpad'}
      </button>
    </div>
  )
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
