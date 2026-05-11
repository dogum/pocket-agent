// =====================================================================
// Hono server entry — local API for the React web client.
//
// Routes mounted under /api:
//   GET    /api/health          — liveness check
//   GET    /api/state           — agent + first-run hint
//   GET    /api/sessions        — list
//   POST   /api/sessions        — create
//   GET    /api/sessions/:id    — fetch one
//   DELETE /api/sessions/:id    — delete (cascades artifacts/briefings)
//   POST   /api/ingests         — submit text/link/file (multipart)
//   GET    /api/artifacts       — paged feed (?session_id, ?before, ?limit)
//   GET    /api/artifacts/:id   — fetch one
//   POST   /api/run             — kick off agent run for a session (SSE)
//   GET    /api/files/:id       — proxy file content (Anthropic Files API)
//
// We bind to localhost only — there is no auth, and the SQLite file is
// the source of truth for everything user-private. Do not expose this
// port to the internet without adding auth.
// =====================================================================

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { createClient, loadConfig, type Config } from './client.js'
import { getAgentState, getDb } from './db.js'
import * as log from './lib/log.js'
import { initScheduler } from './lib/scheduler.js'
import { sessionsRoutes } from './routes/sessions.js'
import { artifactsRoutes } from './routes/artifacts.js'
import { ingestsRoutes } from './routes/ingests.js'
import { runRoutes } from './routes/run.js'
import { filesRoutes } from './routes/files.js'
import { searchRoutes } from './routes/search.js'
import { stateRoutes } from './routes/state.js'
import { profileRoutes } from './routes/profile.js'
import { dataRoutes } from './routes/data.js'
import { triggersRoutes } from './routes/triggers.js'

let config: Config
try {
  config = loadConfig()
} catch (err) {
  log.fail(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

// Eagerly open the DB so migrations run on boot.
const db = getDb(config.dbPath)
log.detail('db', config.dbPath)

// Spin up the trigger scheduler — registers any saved triggers and
// owns the lifecycle of subsequent ones.
initScheduler({
  db,
  client: createClient(config),
  getAgent: () => {
    const a = getAgentState(db)
    if (!a) return null
    return { agent_id: a.agent_id, environment_id: a.environment_id }
  },
})

const app = new Hono()

app.use(
  '/api/*',
  cors({
    // Vite dev server proxies /api → here, so origin checks are mostly
    // moot. Permissive in dev; tighten before any internet exposure.
    origin: '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.get('/api/health', (c) =>
  c.json({ ok: true, ts: new Date().toISOString() }),
)

app.route('/api/state', stateRoutes(config, db))
app.route('/api/profile', profileRoutes(db))
app.route('/api/data', dataRoutes(config, db))
app.route('/api/sessions', sessionsRoutes(config, db))
// Nested triggers routes — mounted under /api/sessions/:sessionId/triggers
app.route('/api/sessions/:sessionId/triggers', triggersRoutes(db))
app.route('/api/artifacts', artifactsRoutes(db))
app.route('/api/ingests', ingestsRoutes(config, db))
app.route('/api/run', runRoutes(config, db))
app.route('/api/files', filesRoutes(config, db))
app.route('/api/search', searchRoutes(db))

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404))

app.onError((err, c) => {
  log.fail(`unhandled: ${err.message}`)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})

const port = config.port
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  log.header('pocket-agent · api', `listening on http://127.0.0.1:${port}`)
})

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`received ${signal}, shutting down`)
    db.close()
    process.exit(0)
  })
}
