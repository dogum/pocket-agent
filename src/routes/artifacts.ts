// Artifacts feed query.
//   GET /              — paged feed across all (or one) sessions
//                        ?session_id=…  ?before=ISO  ?limit=20
//   GET /:id           — fetch one with full components
//   PATCH /:id         — archive or unarchive
//   GET /:id/briefing  — latest briefing for the session this artifact belongs to

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import { rowToArtifact, rowToBriefing } from '../db.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function artifactsRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const sessionId = c.req.query('session_id') || null
    const before = c.req.query('before') || null
    const limitRaw = Number(c.req.query('limit') || DEFAULT_LIMIT)
    const limit = Math.max(1, Math.min(MAX_LIMIT, limitRaw))

    const where: string[] = ['archived = 0']
    const params: (string | number)[] = []
    if (sessionId) {
      where.push('session_id = ?')
      params.push(sessionId)
    }
    if (before) {
      where.push('created_at < ?')
      params.push(before)
    }

    const rows = db
      .prepare(`
        SELECT * FROM artifacts
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(...params, limit + 1) as Parameters<typeof rowToArtifact>[0][]

    const has_more = rows.length > limit
    const slice = has_more ? rows.slice(0, limit) : rows
    return c.json({ artifacts: slice.map(rowToArtifact), has_more })
  })

  app.get('/:id', (c) => {
    const row = db
      .prepare('SELECT * FROM artifacts WHERE id = ?')
      .get(c.req.param('id')) as Parameters<typeof rowToArtifact>[0] | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(rowToArtifact(row))
  })

  app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      archived: boolean
    }>
    const existing = db
      .prepare('SELECT * FROM artifacts WHERE id = ?')
      .get(id) as Parameters<typeof rowToArtifact>[0] | undefined
    if (!existing) return c.json({ error: 'not_found' }, 404)

    if (typeof body.archived === 'boolean') {
      db.prepare('UPDATE artifacts SET archived = ? WHERE id = ?').run(
        body.archived ? 1 : 0,
        id,
      )
    }

    const row = db
      .prepare('SELECT * FROM artifacts WHERE id = ?')
      .get(id) as Parameters<typeof rowToArtifact>[0]
    return c.json(rowToArtifact(row))
  })

  // Convenience: latest briefing across all sessions, or for one session.
  app.get('/_briefings/latest', (c) => {
    const sessionId = c.req.query('session_id') || null
    const row = sessionId
      ? db
          .prepare(
            'SELECT * FROM briefings WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
          )
          .get(sessionId)
      : db
          .prepare('SELECT * FROM briefings ORDER BY created_at DESC LIMIT 1')
          .get()
    if (!row) return c.json({ briefing: null })
    return c.json({ briefing: rowToBriefing(row as Parameters<typeof rowToBriefing>[0]) })
  })

  return app
}
