// =====================================================================
// Hono server entry — local API for the React web client.
//
// Routes mounted under /api:
//   GET    /api/health                        — liveness check
//   GET    /api/state                         — agent + first-run hint
//   GET    /api/sessions                      — list
//   POST   /api/sessions                      — create
//   GET    /api/sessions/:id                  — fetch one
//   DELETE /api/sessions/:id                  — delete (cascades)
//   GET    /api/sessions/:id/triggers         — cron-style triggers (Phase 12)
//   GET    /api/sessions/:id/reflexes         — agent-authored watchers (Phase 21)
//   POST   /api/ingests                       — submit text/link/file
//   GET    /api/artifacts                     — paged feed
//   GET    /api/artifacts/:id                 — fetch one
//   POST   /api/run                           — kick off agent run (SSE)
//   GET    /api/files/:id                     — proxy file content
//   GET    /api/sources                       — list / CRUD ambient sources
//   GET    /api/events                        — long-lived ambient SSE
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
import { sourcesRoutes } from './routes/sources.js'
import { reflexesRoutes } from './routes/reflexes.js'
import { eventsRoutes } from './routes/events.js'
import {
  ensureFakePulseSource,
  reconcileFakePulse,
  shutdownFakePulse,
} from './orchestrator/fakePulse.js'
import {
  initSourcePollers,
  shutdownSourcePollers,
} from './orchestrator/sourcePoll.js'
import {
  initMcpClients,
  shutdownMcpClients,
} from './orchestrator/mcpClient.js'

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

const client = createClient(config)
const getAgent = (): { agent_id: string; environment_id: string } | null => {
  const a = getAgentState(db)
  if (!a) return null
  return { agent_id: a.agent_id, environment_id: a.environment_id }
}

// Seed the fake_pulse source row (disabled) so the user can flip it on
// from the Sources screen without provisioning anything.
ensureFakePulseSource(db)

// Trigger scheduler (Phase 12).
initScheduler({ db, client, getAgent })

// Phase 21 — observation surface.
initSourcePollers({ db, client, getAgent })
initMcpClients({ db, client })
reconcileFakePulse({ db, client, getAgent })

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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
app.route('/api/sessions/:sessionId/triggers', triggersRoutes(db))
app.route('/api/sessions/:sessionId/reflexes', reflexesRoutes(db))
app.route('/api/artifacts', artifactsRoutes(db))
app.route('/api/ingests', ingestsRoutes(config, db))
app.route('/api/run', runRoutes(config, db))
app.route('/api/files', filesRoutes(config, db))
app.route('/api/search', searchRoutes(db))
app.route('/api/sources', sourcesRoutes({ db, client, getAgent }))
app.route('/api/events', eventsRoutes(db))

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404))

app.onError((err, c) => {
  log.fail(`unhandled: ${err.message}`)
  return c.json({ error: 'internal_error', message: err.message }, 500)
})

const port = config.port
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => {
  log.header('pocket-agent · api', `listening on http://127.0.0.1:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`received ${signal}, shutting down`)
    shutdownFakePulse()
    shutdownSourcePollers()
    shutdownMcpClients()
    db.close()
    process.exit(0)
  })
}
