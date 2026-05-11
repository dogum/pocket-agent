// /api/profile — singleton row for the user's display name and stats.
//
// GET    /api/profile  → { name, created_at, updated_at, stats: {...} }
// PATCH  /api/profile  → updates name, returns the new row

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import { countUniqueSources, getProfile, setProfileName } from '../db.js'

export function profileRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const profile = getProfile(db)
    const sessions = (
      db.prepare('SELECT COUNT(*) as n FROM sessions').get() as { n: number }
    ).n
    const artifacts = (
      db
        .prepare('SELECT COUNT(*) as n FROM artifacts WHERE archived = 0')
        .get() as { n: number }
    ).n
    const sources = countUniqueSources(db)
    return c.json({
      ...profile,
      stats: { sessions, artifacts, sources },
    })
  })

  app.patch('/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      name: string
    }>
    if (typeof body.name !== 'string') {
      return c.json({ error: 'name_required' }, 400)
    }
    const trimmed = body.name.trim().slice(0, 80)
    const updated = setProfileName(db, trimmed)
    return c.json(updated)
  })

  return app
}
