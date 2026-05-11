// Trigger CRUD — mounted at /api/sessions/:sessionId/triggers.
//
//   GET    /                — list triggers for the session
//   POST   /                — add one (validates cron, registers)
//   PATCH  /:id             — update (re-registers)
//   DELETE /:id             — delete (unregisters)
//
// Persistence is in-place inside `sessions.config.triggers[]`. The
// registry in `lib/scheduler.ts` is reconciled on every mutation.

import cron from 'node-cron'
import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import type {
  SessionConfig,
  Trigger,
} from '../../shared/index.js'
import { rowToSession } from '../db.js'
import { newId } from '../lib/id.js'
import { reconcileSessionTriggers } from '../lib/scheduler.js'

export function triggersRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const sessionId = c.req.param('sessionId')!
    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as Parameters<typeof rowToSession>[0] | undefined
    if (!row) return c.json({ error: 'session_not_found' }, 404)
    const session = rowToSession(row)
    return c.json({ triggers: session.config.triggers ?? [] })
  })

  app.post('/', async (c) => {
    const sessionId = c.req.param('sessionId')!
    const body = (await c.req.json().catch(() => null)) as Partial<{
      schedule: string
      description: string
      prompt: string
      enabled: boolean
    }> | null

    if (!body?.schedule || !body.prompt) {
      return c.json({ error: 'schedule_and_prompt_required' }, 400)
    }
    if (!cron.validate(body.schedule)) {
      return c.json({ error: 'invalid_cron' }, 400)
    }

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as Parameters<typeof rowToSession>[0] | undefined
    if (!row) return c.json({ error: 'session_not_found' }, 404)
    const session = rowToSession(row)

    const trigger: Trigger = {
      id: newId('trg'),
      schedule: body.schedule.trim(),
      description: (body.description ?? '').trim(),
      prompt: body.prompt.trim(),
      enabled: body.enabled !== false,
    }

    const cfg: SessionConfig = {
      ...session.config,
      triggers: [...(session.config.triggers ?? []), trigger],
    }
    db.prepare(
      'UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?',
    ).run(JSON.stringify(cfg), new Date().toISOString(), session.id)

    reconcileSessionTriggers({ ...session, config: cfg })
    return c.json(trigger, 201)
  })

  app.patch('/:id', async (c) => {
    const sessionId = c.req.param('sessionId')!
    const triggerId = c.req.param('id')!
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      schedule: string
      description: string
      prompt: string
      enabled: boolean
    }>

    if (body.schedule && !cron.validate(body.schedule)) {
      return c.json({ error: 'invalid_cron' }, 400)
    }

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as Parameters<typeof rowToSession>[0] | undefined
    if (!row) return c.json({ error: 'session_not_found' }, 404)
    const session = rowToSession(row)

    const triggers = session.config.triggers ?? []
    const idx = triggers.findIndex((t) => t.id === triggerId)
    if (idx === -1) return c.json({ error: 'trigger_not_found' }, 404)

    const updated: Trigger = {
      ...triggers[idx],
      ...(body.schedule !== undefined ? { schedule: body.schedule.trim() } : {}),
      ...(body.description !== undefined
        ? { description: body.description.trim() }
        : {}),
      ...(body.prompt !== undefined ? { prompt: body.prompt.trim() } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    }
    const next = triggers.slice()
    next[idx] = updated

    const cfg: SessionConfig = { ...session.config, triggers: next }
    db.prepare(
      'UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?',
    ).run(JSON.stringify(cfg), new Date().toISOString(), session.id)

    reconcileSessionTriggers({ ...session, config: cfg })
    return c.json(updated)
  })

  app.delete('/:id', (c) => {
    const sessionId = c.req.param('sessionId')!
    const triggerId = c.req.param('id')!

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(sessionId) as Parameters<typeof rowToSession>[0] | undefined
    if (!row) return c.json({ error: 'session_not_found' }, 404)
    const session = rowToSession(row)

    const triggers = session.config.triggers ?? []
    const next = triggers.filter((t) => t.id !== triggerId)
    if (next.length === triggers.length) {
      return c.json({ error: 'trigger_not_found' }, 404)
    }

    const cfg: SessionConfig = { ...session.config, triggers: next }
    db.prepare(
      'UPDATE sessions SET config = ?, updated_at = ? WHERE id = ?',
    ).run(JSON.stringify(cfg), new Date().toISOString(), session.id)

    reconcileSessionTriggers({ ...session, config: cfg })
    return c.json({ ok: true })
  })

  return app
}
