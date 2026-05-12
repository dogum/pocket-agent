// =====================================================================
// /api/sources — CRUD for the ambient observation surface.
//
//   GET    /api/sources                          — list every source
//   POST   /api/sources                          — create
//   GET    /api/sources/:id                      — fetch one
//   PATCH  /api/sources/:id                      — mutate (enable, rename, reconfigure)
//   DELETE /api/sources/:id                      — remove (cascades observations)
//   GET    /api/sources/:id/observations         — ring-buffer list (most recent first)
//   POST   /api/sources/:id/observations         — emit one manually (dev / testing)
//   POST   /api/sources/:id/attach/:session_id   — wire to a session
//   DELETE /api/sources/:id/attach/:session_id   — detach
//   GET    /api/sources/_for_session/:session_id — list sources attached to a session
//
// After every mutating endpoint, we reconcile the underlying engines
// (fake_pulse interval, polled-URL poller, MCP clients) so the runtime
// state matches the DB state without a server restart.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import type {
  Source,
  SourceConfig,
} from '../../shared/index.js'
import { DEFAULT_RING_BUFFER_SIZE } from '../../shared/index.js'

const MIN_RING_BUFFER_SIZE = 1
const MAX_RING_BUFFER_SIZE = 10_000

/** Clamp ring_buffer_size to a usable range. A 0 (or negative) value
 *  would make the trim query `LIMIT 0` and immediately drop every
 *  inserted observation; an absurdly large value would let one source
 *  monopolize the DB. */
function clampRingBuffer(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_RING_BUFFER_SIZE
  return Math.max(
    MIN_RING_BUFFER_SIZE,
    Math.min(MAX_RING_BUFFER_SIZE, Math.floor(n)),
  )
}

/** Kind-aware shape check on a SourceConfig blob. We refuse to persist
 *  a config that the corresponding backend can't actually use — a
 *  `polled_url` source missing a URL would otherwise sit in the poller
 *  and call `fetch(undefined)` every cadence, generating endless error
 *  rows. Returns the (canonical) config on success. */
function validateConfig(
  kind: Source['kind'],
  raw: unknown,
):
  | { ok: true; config: SourceConfig }
  | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'config must be an object' }
  }
  const cfg = raw as Record<string, unknown>
  if (cfg.kind !== undefined && cfg.kind !== kind) {
    return {
      ok: false,
      error: `config.kind ("${String(cfg.kind)}") does not match source kind ("${kind}")`,
    }
  }
  switch (kind) {
    case 'polled_url': {
      if (typeof cfg.url !== 'string' || !cfg.url.trim()) {
        return { ok: false, error: 'config.url is required for polled_url' }
      }
      try {
        new URL(cfg.url)
      } catch {
        return { ok: false, error: 'config.url is not a valid URL' }
      }
      const poll =
        typeof cfg.poll_seconds === 'number' && Number.isFinite(cfg.poll_seconds)
          ? Math.floor(cfg.poll_seconds)
          : 60
      const headers =
        cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)
          ? (cfg.headers as Record<string, string>)
          : undefined
      const payload_path =
        typeof cfg.payload_path === 'string' ? cfg.payload_path : undefined
      return {
        ok: true,
        config: {
          kind: 'polled_url',
          url: cfg.url.trim(),
          poll_seconds: Math.max(30, poll),
          headers,
          payload_path,
        },
      }
    }
    case 'mcp': {
      if (typeof cfg.endpoint !== 'string' || !cfg.endpoint.trim()) {
        return { ok: false, error: 'config.endpoint is required for mcp' }
      }
      try {
        new URL(cfg.endpoint)
      } catch {
        return { ok: false, error: 'config.endpoint is not a valid URL' }
      }
      const subscribe = Array.isArray(cfg.subscribe)
        ? cfg.subscribe.filter((s): s is string => typeof s === 'string')
        : undefined
      const auth_env_var =
        typeof cfg.auth_env_var === 'string' ? cfg.auth_env_var : undefined
      return {
        ok: true,
        config: {
          kind: 'mcp',
          endpoint: cfg.endpoint.trim(),
          auth_env_var,
          subscribe,
        },
      }
    }
    case 'webhook': {
      if (typeof cfg.path !== 'string' || !cfg.path.trim()) {
        return { ok: false, error: 'config.path is required for webhook' }
      }
      const secret_env_var =
        typeof cfg.secret_env_var === 'string' ? cfg.secret_env_var : undefined
      return {
        ok: true,
        config: { kind: 'webhook', path: cfg.path.trim(), secret_env_var },
      }
    }
    case 'demo': {
      const cad =
        typeof cfg.cadence_seconds === 'number' &&
        Number.isFinite(cfg.cadence_seconds)
          ? Math.floor(cfg.cadence_seconds)
          : 60
      return {
        ok: true,
        config: { kind: 'demo', cadence_seconds: Math.max(15, cad) },
      }
    }
  }
}
import {
  attachSource,
  deleteSource,
  detachSource,
  getSource,
  getSourceByName,
  insertSource,
  listObservations,
  listSources,
  sourcesForSession,
  updateSource,
} from '../db.js'
import { newId } from '../lib/id.js'
import { ingestObservation } from '../orchestrator/observations.js'
import { reconcileFakePulse } from '../orchestrator/fakePulse.js'
import { reconcile as reconcileMcp } from '../orchestrator/mcpClient.js'
import { reconcilePollers } from '../orchestrator/sourcePoll.js'

interface RoutesDeps {
  db: DB
  client: Anthropic
  getAgent: () => { agent_id: string; environment_id: string } | null
}

export function sourcesRoutes(deps: RoutesDeps): Hono {
  const app = new Hono()
  const { db } = deps

  app.get('/', (c) => {
    return c.json({ sources: listSources(db) })
  })

  app.get('/_for_session/:sessionId', (c) => {
    const sessionId = c.req.param('sessionId')
    return c.json({ sources: sourcesForSession(db, sessionId) })
  })

  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => null)) as Partial<{
      name: string
      label: string
      description: string
      kind: Source['kind']
      config: SourceConfig
      enabled: boolean
      ring_buffer_size: number
    }> | null
    if (!body?.name || !body.kind || !body.config || !body.label) {
      return c.json({ error: 'name, label, kind, and config are required' }, 400)
    }
    if (getSourceByName(db, body.name)) {
      return c.json({ error: 'source name already exists' }, 409)
    }
    const cfgResult = validateConfig(body.kind, body.config)
    if (!cfgResult.ok) return c.json({ error: cfgResult.error }, 400)
    const now = new Date().toISOString()
    const source: Source = {
      id: newId('src'),
      kind: body.kind,
      name: body.name,
      label: body.label,
      description: body.description,
      status: 'configuring',
      config: cfgResult.config,
      enabled: Boolean(body.enabled),
      ring_buffer_size: clampRingBuffer(
        body.ring_buffer_size ?? DEFAULT_RING_BUFFER_SIZE,
      ),
      created_at: now,
      updated_at: now,
    }
    insertSource(db, source)
    reconcileAll(deps)
    return c.json(source, 201)
  })

  app.get('/:id', (c) => {
    const source = getSource(db, c.req.param('id'))
    if (!source) return c.json({ error: 'not_found' }, 404)
    return c.json(source)
  })

  app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const source = getSource(db, id)
    if (!source) return c.json({ error: 'not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      label: string
      description: string
      enabled: boolean
      config: SourceConfig
      ring_buffer_size: number
    }>
    // If the caller is changing config, validate it for the existing
    // kind. Kind itself is immutable — switching kinds would invalidate
    // every backend's running state for this source.
    let nextConfig: SourceConfig = source.config
    if (body.config !== undefined) {
      const cfgResult = validateConfig(source.kind, body.config)
      if (!cfgResult.ok) return c.json({ error: cfgResult.error }, 400)
      nextConfig = cfgResult.config
    }

    const next: Source = {
      ...source,
      label: body.label ?? source.label,
      description: body.description ?? source.description,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : source.enabled,
      config: nextConfig,
      ring_buffer_size:
        body.ring_buffer_size !== undefined
          ? clampRingBuffer(body.ring_buffer_size)
          : source.ring_buffer_size,
      updated_at: new Date().toISOString(),
    }
    updateSource(db, next)
    reconcileAll(deps)
    return c.json(getSource(db, id))
  })

  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    if (!getSource(db, id)) return c.json({ error: 'not_found' }, 404)
    deleteSource(db, id)
    reconcileAll(deps)
    return c.json({ ok: true })
  })

  app.get('/:id/observations', (c) => {
    const id = c.req.param('id')
    if (!getSource(db, id)) return c.json({ error: 'not_found' }, 404)
    const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') || 50)))
    return c.json({ observations: listObservations(db, id, limit) })
  })

  // Manual emit — drives the demo, and is handy from curl during dev.
  app.post('/:id/observations', async (c) => {
    const id = c.req.param('id')
    const source = getSource(db, id)
    if (!source) return c.json({ error: 'not_found' }, 404)
    const body = (await c.req.json().catch(() => null)) as Partial<{
      payload: Record<string, unknown>
      summary: string
    }> | null
    if (!body?.payload) {
      return c.json({ error: 'payload is required' }, 400)
    }
    const observation = ingestObservation(deps, {
      source,
      payload: body.payload,
      summary:
        body.summary ??
        Object.entries(body.payload)
          .slice(0, 4)
          .map(([k, v]) => `${k}=${v}`)
          .join(', '),
    })
    return c.json({ observation }, 201)
  })

  app.post('/:id/attach/:sessionId', (c) => {
    const id = c.req.param('id')
    const sessionId = c.req.param('sessionId')
    if (!getSource(db, id)) return c.json({ error: 'source_not_found' }, 404)
    const sessionRow = db
      .prepare('SELECT id FROM sessions WHERE id = ?')
      .get(sessionId)
    if (!sessionRow) return c.json({ error: 'session_not_found' }, 404)
    attachSource(db, sessionId, id)
    return c.json({ ok: true })
  })

  app.delete('/:id/attach/:sessionId', (c) => {
    const id = c.req.param('id')
    const sessionId = c.req.param('sessionId')
    detachSource(db, sessionId, id)
    return c.json({ ok: true })
  })

  return app
}

function reconcileAll(deps: RoutesDeps): void {
  reconcilePollers()
  reconcileMcp()
  reconcileFakePulse(deps)
}
