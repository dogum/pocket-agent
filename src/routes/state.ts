// GET /api/state — surfaces app-wide state to the client on boot.
// Includes:
//   - agent provisioning status (so the UI can route to a setup screen
//     if the user hasn't run bootstrap-agent yet)
//   - first-run hint (so we can show onboarding when there are zero sessions)

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import type { Config } from '../client.js'
import { getAgentState } from '../db.js'

export function stateRoutes(_config: Config, db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const agent = getAgentState(db)
    const sessionCount = (
      db.prepare('SELECT COUNT(*) as n FROM sessions').get() as { n: number }
    ).n
    const artifactCount = (
      db.prepare('SELECT COUNT(*) as n FROM artifacts').get() as { n: number }
    ).n

    return c.json({
      agent: agent
        ? { id: agent.agent_id, version: agent.agent_version, prompt_hash: agent.prompt_hash }
        : null,
      counts: {
        sessions: sessionCount,
        artifacts: artifactCount,
      },
      first_run: sessionCount === 0,
    })
  })

  return app
}
