// /api/data/* — privacy & data utilities.
//
//   GET    /api/data/summary  → counts + DB path + upload-cache size
//   GET    /api/data/export   → JSON dump of all user data
//   DELETE /api/data/all      → wipe sessions/ingests/artifacts/briefings/uploads;
//                                preserve agent_state and profile.
//
// File-system writes (cache deletion) are best-effort — we don't error
// if a cache file is already gone.

import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import type { Config } from '../client.js'
import {
  getProfile,
  rowToArtifact,
  rowToBriefing,
  rowToIngest,
  rowToSession,
} from '../db.js'

interface FileUploadRow {
  file_id: string
  ingest_id: string | null
  filename: string
  size_bytes: number
  mime_type: string
  uploaded_at: string
}

export function dataRoutes(config: Config, db: DB): Hono {
  const app = new Hono()

  app.get('/summary', (c) => {
    const sessions = (
      db.prepare('SELECT COUNT(*) as n FROM sessions').get() as { n: number }
    ).n
    const ingests = (
      db.prepare('SELECT COUNT(*) as n FROM ingests').get() as { n: number }
    ).n
    const artifacts = (
      db.prepare('SELECT COUNT(*) as n FROM artifacts').get() as { n: number }
    ).n
    const fileUploads = (
      db.prepare('SELECT COUNT(*) as n FROM file_uploads').get() as { n: number }
    ).n

    let cacheBytes = 0
    if (existsSync(config.uploadCacheDir)) {
      try {
        for (const name of readdirSync(config.uploadCacheDir)) {
          const path = join(config.uploadCacheDir, name)
          const s = statSync(path)
          if (s.isFile()) cacheBytes += s.size
        }
      } catch {
        // best-effort
      }
    }

    return c.json({
      counts: { sessions, ingests, artifacts, file_uploads: fileUploads },
      paths: {
        db: config.dbPath,
        upload_cache: config.uploadCacheDir,
      },
      upload_cache_bytes: cacheBytes,
    })
  })

  app.get('/export', () => {
    const sessions = (
      db.prepare('SELECT * FROM sessions').all() as Parameters<typeof rowToSession>[0][]
    ).map(rowToSession)
    const ingests = (
      db.prepare('SELECT * FROM ingests').all() as Parameters<typeof rowToIngest>[0][]
    ).map(rowToIngest)
    const artifacts = (
      db
        .prepare('SELECT * FROM artifacts')
        .all() as Parameters<typeof rowToArtifact>[0][]
    ).map(rowToArtifact)
    const briefings = (
      db
        .prepare('SELECT * FROM briefings')
        .all() as Parameters<typeof rowToBriefing>[0][]
    ).map(rowToBriefing)
    const profile = getProfile(db)

    const dump = {
      exported_at: new Date().toISOString(),
      app: 'pocket-agent',
      profile,
      sessions,
      ingests,
      artifacts,
      briefings,
    }

    const filename = `pocket-agent-export-${new Date()
      .toISOString()
      .slice(0, 10)}.json`
    return new Response(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  })

  app.delete('/all', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      confirm: string
    }>
    if (body.confirm !== 'delete') {
      return c.json(
        {
          error: 'confirm_required',
          message: 'Pass {"confirm": "delete"} to proceed.',
        },
        400,
      )
    }

    // Snapshot the file_ids we cached locally so we can sweep the cache.
    const uploads = db
      .prepare('SELECT file_id FROM file_uploads')
      .all() as Array<Pick<FileUploadRow, 'file_id'>>

    db.transaction(() => {
      // Order matters because of FK cascades, but cascades cover most of
      // it — we still drop child tables explicitly so the FTS triggers
      // run cleanly.
      db.exec(`
        DELETE FROM artifacts;
        DELETE FROM briefings;
        DELETE FROM ingests;
        DELETE FROM file_uploads;
        DELETE FROM sessions;
      `)
    })()

    // Sweep cached upload bytes; ignore individual failures.
    if (existsSync(config.uploadCacheDir)) {
      for (const u of uploads) {
        const path = join(config.uploadCacheDir, u.file_id)
        try {
          unlinkSync(path)
        } catch {
          // gone already, fine
        }
      }
    }

    return c.json({ ok: true })
  })

  return app
}
