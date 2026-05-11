// =====================================================================
// sourcePoll — periodic fetcher for polled_url sources.
//
// We register a setInterval per enabled polled_url source. On each tick
// we GET the configured URL with optional static headers, pluck the
// payload (root by default, or a JSON pointer if `payload_path` is
// set), and feed it through `ingestObservation`.
//
// `reconcilePollers` is called at boot and after every source mutation.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { Database as DB } from 'better-sqlite3'

import type {
  Source,
  SourcePolledUrlConfig,
} from '../../shared/index.js'
import { listSources, updateSource } from '../db.js'
import * as log from '../lib/log.js'
import { ingestObservation } from './observations.js'

interface PollerHandle {
  source_id: string
  timer: NodeJS.Timeout
  /** Cadence in seconds at the time we scheduled it. We restart if it changes. */
  cadence_seconds: number
}

const pollers = new Map<string, PollerHandle>()

export interface PollDeps {
  db: DB
  client: Anthropic
  getAgent: () => { agent_id: string; environment_id: string } | null
}

let depsRef: PollDeps | null = null

export function initSourcePollers(deps: PollDeps): void {
  depsRef = deps
  reconcilePollers()
}

export function reconcilePollers(): void {
  if (!depsRef) return
  const { db } = depsRef

  const polled = listSources(db).filter(
    (s) => s.kind === 'polled_url' && s.enabled,
  )

  const liveIds = new Set(polled.map((s) => s.id))
  for (const [id, handle] of pollers) {
    if (!liveIds.has(id)) {
      clearInterval(handle.timer)
      pollers.delete(id)
    }
  }

  for (const source of polled) {
    const cfg = source.config as SourcePolledUrlConfig
    const cadence = Math.max(30, cfg.poll_seconds)
    const existing = pollers.get(source.id)
    if (existing && existing.cadence_seconds === cadence) continue

    if (existing) clearInterval(existing.timer)

    const timer = setInterval(() => {
      void poll(source.id)
    }, cadence * 1000)
    pollers.set(source.id, {
      source_id: source.id,
      timer,
      cadence_seconds: cadence,
    })
    // Kick once shortly so the user sees activity without waiting a full cycle.
    setTimeout(() => poll(source.id), 4000)
    log.detail('poll', `${source.name} → every ${cadence}s`)
  }
}

async function poll(sourceId: string): Promise<void> {
  if (!depsRef) return
  const { db } = depsRef
  // Re-read each tick — config may have changed.
  const source = listSources(db).find((s) => s.id === sourceId)
  if (!source || !source.enabled || source.kind !== 'polled_url') return
  const cfg = source.config as SourcePolledUrlConfig

  try {
    const res = await fetch(cfg.url, {
      method: 'GET',
      headers: cfg.headers ?? {},
    })
    if (!res.ok) {
      markError(db, source, `HTTP ${res.status} ${res.statusText}`)
      return
    }
    const text = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { raw: text }
    }
    const payload = pluckPath(parsed, cfg.payload_path)
    const obj = isRecord(payload) ? payload : { value: payload }

    if (source.status !== 'connected') {
      updateSource(db, {
        ...source,
        status: 'connected',
        last_error: undefined,
        updated_at: new Date().toISOString(),
      })
    }

    ingestObservation(depsRef, {
      source,
      payload: obj,
      summary: summarize(obj),
    })
  } catch (err) {
    markError(db, source, err instanceof Error ? err.message : String(err))
  }
}

function markError(db: DB, source: Source, message: string): void {
  updateSource(db, {
    ...source,
    status: 'error',
    last_error: message,
    updated_at: new Date().toISOString(),
  })
  log.warn(`poll · ${source.name} failed: ${message}`)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function pluckPath(value: unknown, path?: string): unknown {
  if (!path) return value
  const parts = path.split('.')
  let cur: unknown = value
  for (const p of parts) {
    if (!isRecord(cur)) return undefined
    cur = cur[p]
  }
  return cur
}

function summarize(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).slice(0, 4)
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(', ')
}

export function shutdownSourcePollers(): void {
  for (const handle of pollers.values()) clearInterval(handle.timer)
  pollers.clear()
}
