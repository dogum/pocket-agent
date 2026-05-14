import {
  useEffect,
  useState,
  type Dispatch,
  type JSX,
  type SetStateAction,
} from 'react'

import type {
  CounterComponent,
  ScratchpadComponent,
  TimerComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

export function CTimer({
  artifactId,
  id,
  label,
  duration_seconds,
  elapsed_seconds = 0,
  mode = 'countdown',
  completion_prompt,
  onInteraction,
}: TimerComponent & VocabularyRendererProps): JSX.Element {
  const [elapsed, setElapsed] = useStoredNumber(
    scopedStorageKey(artifactId, 'timer', id, 'elapsed'),
    elapsed_seconds,
  )
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
    complete()
  }, [
    completed,
    duration,
    elapsed,
    mode,
  ])

  function complete(): void {
    setRunning(false)
    setCompleted(true)
    if (mode === 'countdown') {
      setElapsed(duration)
    }
    void onInteraction?.({
      kind: 'timer.complete',
      component_type: 'timer',
      component_id: id,
      payload: {
        id,
        label,
        mode,
        duration_seconds: duration,
        elapsed_seconds: mode === 'countdown' ? duration : elapsed,
        completion_prompt,
      },
    })
  }

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
        <button
          type="button"
          className="mini-btn"
          onClick={complete}
          disabled={completed}
        >
          Done
        </button>
      </div>
    </div>
  )
}

export function CCounter({
  artifactId,
  id,
  label,
  value,
  target,
  unit,
  step = 1,
  submit_label,
  onInteraction,
}: CounterComponent & VocabularyRendererProps): JSX.Element {
  const [current, setCurrent] = useStoredNumber(
    scopedStorageKey(artifactId, 'counter', id, 'value'),
    value,
  )
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
          onClick={() => setCurrent((n) => Math.max(0, n - step))}
        >
          -
        </button>
        <button
          type="button"
          className="mini-btn"
          onClick={() => setCurrent((n) => n + step)}
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
  artifactId,
  id,
  title,
  placeholder,
  content,
  shared_with_agent,
  privacy_note,
  submit_label,
  onInteraction,
}: ScratchpadComponent & VocabularyRendererProps): JSX.Element {
  const [value, setValue] = useStoredString(
    scopedStorageKey(artifactId, 'scratchpad', id, 'content'),
    content,
  )
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
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {privacy_note && <p className="privacy">{privacy_note}</p>}
      <button type="button" className="btn primary" onClick={submit}>
        {sent ? 'Sent' : (submit_label ?? 'Save scratchpad')}
      </button>
    </div>
  )
}

function storageKey(key: string): string {
  return `pocket-agent:vocabulary:${key}`
}

function scopedStorageKey(
  artifactId: string | undefined,
  kind: string,
  componentId: string,
  field: string,
): string {
  return `${artifactId ?? 'global'}:${kind}:${componentId}:${field}`
}

function useStoredString(
  key: string,
  initial: string,
): [string, Dispatch<SetStateAction<string>>] {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial
    return window.localStorage.getItem(storageKey(key)) ?? initial
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(key), value)
  }, [key, value])
  return [value, setValue]
}

function useStoredNumber(
  key: string,
  initial: number,
): [number, Dispatch<SetStateAction<number>>] {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial
    const raw = window.localStorage.getItem(storageKey(key))
    if (raw === null) return initial
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : initial
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey(key), String(value))
  }, [key, value])
  return [value, setValue]
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
