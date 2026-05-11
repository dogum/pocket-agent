// =====================================================================
// /api/events — single long-lived SSE stream of ambient events.
//
// The web client opens ONE connection and learns about everything
// happening server-side that isn't already arriving via /api/run:
//   • observations from sources
//   • reflexes firing
//   • artifacts updating in place
//   • the server-side run queue starting / finishing jobs
//
// The /api/run SSE stream still covers user-initiated runs — those
// events are NOT duplicated on /api/events. Other server-initiated
// runs (triggers, reflexes, artifact updates) ARE forwarded here so
// the UI banner and feed stay coherent.
// =====================================================================

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

import { listArtifactVersions } from '../db.js'
import type { Database as DB } from 'better-sqlite3'
import { queueState } from '../lib/runQueue.js'
import { subscribe, type AmbientEvent } from '../lib/eventBus.js'

export function eventsRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', async (c) => {
    return streamSSE(c, async (stream) => {
      // First, send the current queue state so the client can paint
      // an immediate banner without waiting for the next event.
      await stream.writeSSE({
        event: 'queue.state',
        data: JSON.stringify({ runs: queueState() }),
      })

      const queue: AmbientEvent[] = []
      let resolveNext: (() => void) | null = null

      const unsubscribe = subscribe((e) => {
        queue.push(e)
        if (resolveNext) {
          const r = resolveNext
          resolveNext = null
          r()
        }
      })

      const onAbort = (): void => {
        unsubscribe()
        if (resolveNext) {
          const r = resolveNext
          resolveNext = null
          r()
        }
      }
      c.req.raw.signal.addEventListener('abort', onAbort)

      try {
        while (!c.req.raw.signal.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveNext = resolve
            })
            continue
          }
          const e = queue.shift()
          if (!e) continue
          await stream.writeSSE({ event: e.type, data: JSON.stringify(e) })
        }
      } finally {
        unsubscribe()
      }
    })
  })

  // Convenience: an artifact's version history (the live-artifact "updated 3×" sheet).
  app.get('/artifacts/:id/versions', (c) => {
    const id = c.req.param('id')
    return c.json({ versions: listArtifactVersions(db, id) })
  })

  return app
}
