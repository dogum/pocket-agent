// =====================================================================
// fakePulse — the built-in demo Source.
//
// Emits a synthetic Observation on a cadence (default 60s) with a
// randomized payload of {energy, mood, focus, hr_resting}. Ships
// DISABLED. Once a user enables it from the Sources screen, it starts
// ticking — this is how reflexes + living artifacts get tested
// end-to-end without setting up any external service.
//
// The payload is intentionally low-cardinality so the user can write
// expressive reflexes ("when energy < 30 in the morning, suggest a
// recovery workout").
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { Database as DB } from 'better-sqlite3'

import {
  DEFAULT_RING_BUFFER_SIZE,
  type Source,
  type SourceDemoConfig,
} from '../../shared/index.js'
import {
  getSourceByName,
  insertSource,
  updateSource,
} from '../db.js'
import { newId } from '../lib/id.js'
import * as log from '../lib/log.js'
import { ingestObservation } from './observations.js'

export const FAKE_PULSE_NAME = 'fake_pulse'
const DEFAULT_CADENCE_SECONDS = 60

let timer: NodeJS.Timeout | null = null
let depsRef: FakePulseDeps | null = null

export interface FakePulseDeps {
  db: DB
  client: Anthropic
  getAgent: () => { agent_id: string; environment_id: string } | null
}

/** Ensure the fake_pulse source row exists. If it does, leave its
 *  enabled flag alone (the user controls it). */
export function ensureFakePulseSource(db: DB): Source {
  const existing = getSourceByName(db, FAKE_PULSE_NAME)
  if (existing) return existing

  const now = new Date().toISOString()
  const source: Source = {
    id: newId('src'),
    kind: 'demo',
    name: FAKE_PULSE_NAME,
    label: 'Fake pulse',
    description:
      'Built-in demo source. Emits synthetic energy/mood/focus/hr_resting every minute so you can test reflexes and living artifacts without wiring an external service.',
    status: 'paused',
    config: { kind: 'demo', cadence_seconds: DEFAULT_CADENCE_SECONDS },
    enabled: false,
    ring_buffer_size: DEFAULT_RING_BUFFER_SIZE,
    created_at: now,
    updated_at: now,
  }
  insertSource(db, source)
  log.detail('fake-pulse', 'seeded source row (disabled by default)')
  return source
}

/** Start (or restart) the pulse if the source is enabled. Safe to call
 *  multiple times — replaces any prior interval. */
export function reconcileFakePulse(deps: FakePulseDeps): void {
  depsRef = deps
  const source = getSourceByName(deps.db, FAKE_PULSE_NAME)
  if (!source) return
  const config = source.config as SourceDemoConfig
  if (timer) clearInterval(timer)
  if (!source.enabled) {
    timer = null
    markStatus(deps.db, source, 'paused')
    return
  }
  // Same NaN guard as polled_url: a malformed cadence_seconds would
  // collapse setInterval into a tight loop.
  const rawCadence =
    typeof config.cadence_seconds === 'number' &&
    Number.isFinite(config.cadence_seconds)
      ? config.cadence_seconds
      : DEFAULT_CADENCE_SECONDS
  const ms = Math.max(15, Math.floor(rawCadence)) * 1000
  markStatus(deps.db, source, 'connected')
  log.detail('fake-pulse', `ticking every ${ms / 1000}s`)
  timer = setInterval(() => tick(), ms)
  // Tick once immediately so the user sees it work on enable.
  setTimeout(() => tick(), 1500)
}

export function shutdownFakePulse(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function tick(): void {
  if (!depsRef) return
  const source = getSourceByName(depsRef.db, FAKE_PULSE_NAME)
  if (!source || !source.enabled) return
  const payload = nextPayload()
  ingestObservation(depsRef, {
    source,
    payload: payload as Record<string, unknown>,
    summary: summarize(payload),
  })
}

interface PulsePayload {
  energy: number
  mood: 'low' | 'ok' | 'good'
  focus: number
  hr_resting: number
  /** Local clock hour as a convenience for time-based reflex matching. */
  hour: number
  [key: string]: unknown
}

function nextPayload(): PulsePayload {
  const energy = randomInt(15, 95)
  const focus = randomInt(20, 95)
  const hr_resting = randomInt(48, 72)
  // Bias mood toward energy.
  const mood: PulsePayload['mood'] =
    energy < 35 ? 'low' : energy < 65 ? 'ok' : 'good'
  const hour = new Date().getHours()
  return { energy, mood, focus, hr_resting, hour }
}

function summarize(p: PulsePayload): string {
  return `energy ${p.energy}, mood ${p.mood}, focus ${p.focus}, rest HR ${p.hr_resting}`
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function markStatus(db: DB, source: Source, status: Source['status']): void {
  if (source.status === status) return
  updateSource(db, {
    ...source,
    status,
    last_error: undefined,
    updated_at: new Date().toISOString(),
  })
}
