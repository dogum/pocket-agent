// /api/files/:id/content — proxy file content from local cache or
// the Anthropic Files API. Used by the web client's preview UI.

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import { createClient, type Config } from '../client.js'
import { getFileContent } from '../lib/uploads.js'

export function filesRoutes(config: Config, db: DB): Hono {
  const app = new Hono()
  const client = createClient(config)

  app.get('/:id/content', async (c) => {
    const id = c.req.param('id')
    const result = await getFileContent(client, db, id)
    if (!result) return c.json({ error: 'not_found' }, 404)
    // Hand back a raw web Response — bypasses Hono's strict body
    // typing for binary payloads while still preserving status/headers.
    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `inline; filename="${result.filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  })

  return app
}
