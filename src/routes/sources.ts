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
    const now = new Date().toISOString()
    const source: Source = {
      id: newId('src'),
      kind: body.kind,
      name: body.name,
      label: body.label,
      description: body.description,
      status: 'configuring',
      config: body.config,
      enabled: Boolean(body.enabled),
      ring_buffer_size: body.ring_buffer_size ?? DEFAULT_RING_BUFFER_SIZE,
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
    const next: Source = {
      ...source,
      label: body.label ?? source.label,
      description: body.description ?? source.description,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : source.enabled,
      config: body.config ?? source.config,
      ring_buffer_size: body.ring_buffer_size ?? source.ring_buffer_size,
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
