// Sessions CRUD.
//   GET    /                — list all (newest updated first)
//   POST   /                — create a new session
//   GET    /:id             — fetch one
//   PATCH  /:id             — rename / update description / status
//   DELETE /:id             — drop (cascades artifacts + briefings)
//
// We do NOT eagerly create a managed-agent session here — that happens
// at the moment of the first ingest, in /api/run. Local sessions exist
// independently of any Anthropic resource.

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import type { Config } from '../client.js'
import { rowToSession } from '../db.js'
import { newId } from '../lib/id.js'
import { hasActiveOrPending } from '../lib/runQueue.js'
import {
  dropSession,
  reconcileSessionTriggers,
  unregisterAllForSession,
} from '../lib/scheduler.js'
import type { Session, SessionConfig } from '../../shared/index.js'

export function sessionsRoutes(_config: Config, db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    // ?archived=1 returns archived only; ?archived=all returns both;
    // default returns non-archived only.
    const archived = c.req.query('archived')
    const rows =
      archived === 'all'
        ? (db
            .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
            .all() as Parameters<typeof rowToSession>[0][])
        : archived === '1'
          ? (db
              .prepare(
                'SELECT * FROM sessions WHERE archived = 1 ORDER BY updated_at DESC',
              )
              .all() as Parameters<typeof rowToSession>[0][])
          : (db
              .prepare(
                'SELECT * FROM sessions WHERE archived = 0 ORDER BY updated_at DESC',
              )
              .all() as Parameters<typeof rowToSession>[0][])
    return c.json({ sessions: rows.map(rowToSession) })
  })

  app.post('/', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      name: string
      description: string
      config: SessionConfig
    }>

    const name = body.name?.trim()
    if (!name) {
      return c.json({ error: 'name_required' }, 400)
    }

    const id = newId('s')
    const now = new Date().toISOString()
    const config: SessionConfig = body.config ?? {}

    db.prepare(
      `INSERT INTO sessions (id, name, description, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      body.description ?? null,
      JSON.stringify(config),
      now,
      now,
    )

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Parameters<typeof rowToSession>[0]
    return c.json(rowToSession(row), 201)
  })

  app.get('/:id', (c) => {
    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(c.req.param('id')) as Parameters<typeof rowToSession>[0] | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(rowToSession(row))
  })

  app.patch('/:id', async (c) => {
    const id = c.req.param('id')
    const body = (await c.req.json().catch(() => ({}))) as Partial<
      Pick<Session, 'name' | 'description' | 'status' | 'archived'>
    >
    const existing = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Parameters<typeof rowToSession>[0] | undefined
    if (!existing) return c.json({ error: 'not_found' }, 404)

    const archivedNext =
      body.archived !== undefined ? (body.archived ? 1 : 0) : null

    db.prepare(`
      UPDATE sessions SET
        name        = COALESCE(?, name),
        description = COALESCE(?, description),
        status      = COALESCE(?, status),
        archived    = COALESCE(?, archived),
        updated_at  = ?
      WHERE id = ?
    `).run(
      body.name ?? null,
      body.description ?? null,
      body.status ?? null,
      archivedNext,
      new Date().toISOString(),
      id,
    )

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Parameters<typeof rowToSession>[0]
    const updated = rowToSession(row)

    // Reconcile triggers: pause when archiving, restart when unarchiving.
    if (body.archived === true) {
      unregisterAllForSession(id)
    } else if (body.archived === false) {
      reconcileSessionTriggers(updated)
    }

    return c.json(updated)
  })

  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    dropSession(id)
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    if (result.changes === 0) return c.json({ error: 'not_found' }, 404)
    return c.json({ ok: true })
  })

  // Drop the managed-agent linkage so the next ingest creates a fresh
  // managed session on the agent's CURRENT version. Local rows
  // (artifacts, ingests, attached sources, briefings) all stay.
  //
  // Anthropic Managed Agents pin a session to the agent version that
  // was current at session-create time (per managed-agents/sessions.md:
  // "passing in the `agent` ID as a string starts the session with the
  // latest agent version"). When the system prompt is later updated
  // via `pnpm bootstrap-agent`, existing sessions remain on their
  // original pin. This endpoint is the user-side reset: drop the
  // managed-session pointer so the next run in this thread picks up
  // the latest prompt + tools.
  app.post('/:id/restart-agent', (c) => {
    const id = c.req.param('id')
    const existing = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Parameters<typeof rowToSession>[0] | undefined
    if (!existing) return c.json({ error: 'not_found' }, 404)

    // Reject while a user / trigger / reflex / artifact-update run is
    // in flight or queued — the run.ts post-write of
    // `finalResult.managedSessionId` would otherwise silently undo
    // this restart and leave the thread pinned to the old session.
    // The user retries after the run finishes; the run-queue is
    // single-job-per-session so this is a tight window.
    if (hasActiveOrPending(id)) {
      return c.json(
        {
          error: 'run_in_flight',
          message:
            'A run is active or queued on this session. Wait for it to finish, then restart the agent thread.',
        },
        409,
      )
    }

    db.prepare(`
      UPDATE sessions SET
        managed_session_id = NULL,
        run_status         = NULL,
        updated_at         = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id)

    const row = db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as Parameters<typeof rowToSession>[0]
    return c.json(rowToSession(row))
  })

  return app
}
