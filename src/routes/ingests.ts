// Ingest endpoint — accepts a single user input and persists it.
//
// Two content types supported:
//   • application/json    — text / link / share ingests with raw_text
//   • multipart/form-data  — photo / voice / file ingests with a file blob
//
// Multipart fields:
//   file        — required; the binary blob
//   session_id  — required
//   type        — optional; defaults to 'file' (or 'photo' if image MIME)

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import {
  classifyError,
  createClient,
  type Config,
} from '../client.js'
import { rowToIngest } from '../db.js'
import { newId } from '../lib/id.js'
import { uploadFile } from '../lib/uploads.js'
import type { IngestMetadata, IngestType } from '../../shared/index.js'

const VALID_TYPES = new Set<IngestType>([
  'photo',
  'voice',
  'file',
  'link',
  'text',
  'share',
])

export function ingestsRoutes(config: Config, db: DB): Hono {
  const app = new Hono()
  const client = createClient(config)

  app.get('/', (c) => {
    const sessionId = c.req.query('session_id') || null
    const limit = Math.min(100, Number(c.req.query('limit') || 50))

    const rows = sessionId
      ? db
          .prepare(
            'SELECT * FROM ingests WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
          )
          .all(sessionId, limit)
      : db
          .prepare('SELECT * FROM ingests ORDER BY created_at DESC LIMIT ?')
          .all(limit)

    return c.json({
      ingests: (rows as Parameters<typeof rowToIngest>[0][]).map(rowToIngest),
    })
  })

  app.post('/', async (c) => {
    const contentType = c.req.header('content-type') || ''

    // ─── multipart: file upload ──────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      let parsed: Record<string, unknown>
      try {
        parsed = (await c.req.parseBody({ all: false })) as Record<string, unknown>
      } catch (e) {
        return c.json(
          {
            error: 'parse_error',
            message: e instanceof Error ? e.message : String(e),
          },
          400,
        )
      }

      const file = parsed.file
      if (!(file instanceof File)) {
        return c.json({ error: 'file_required' }, 400)
      }

      const sessionId = (parsed.session_id as string) || null
      if (!sessionId) {
        return c.json({ error: 'session_id_required' }, 400)
      }
      const sessionExists = db
        .prepare('SELECT 1 FROM sessions WHERE id = ?')
        .get(sessionId)
      if (!sessionExists) return c.json({ error: 'session_not_found' }, 404)

      const explicitType = parsed.type as IngestType | undefined
      const inferredType: IngestType = file.type.startsWith('image/')
        ? 'photo'
        : file.type.startsWith('audio/')
          ? 'voice'
          : 'file'
      const type: IngestType = explicitType ?? inferredType

      const id = newId('ing')
      const now = new Date().toISOString()

      db.prepare(`
        INSERT INTO ingests (id, session_id, type, file_url, raw_text, metadata, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sessionId,
        type,
        null,
        null,
        JSON.stringify({
          timestamp: now,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        } satisfies IngestMetadata),
        'processing',
        now,
      )

      try {
        const result = await uploadFile({
          client,
          db,
          cacheDir: config.uploadCacheDir,
          file,
          ingestId: id,
        })

        const metadata: IngestMetadata = {
          timestamp: now,
          file_name: result.filename,
          file_size: result.size,
          mime_type: result.mimeType,
          file_id: result.fileId,
        }
        db.prepare(
          'UPDATE ingests SET metadata = ?, status = ? WHERE id = ?',
        ).run(JSON.stringify(metadata), 'routed', id)

        const row = db
          .prepare('SELECT * FROM ingests WHERE id = ?')
          .get(id) as Parameters<typeof rowToIngest>[0]
        return c.json(rowToIngest(row), 201)
      } catch (err) {
        const cls = classifyError(err)
        db.prepare(
          'UPDATE ingests SET status = ?, error_message = ? WHERE id = ?',
        ).run('failed', cls.message, id)
        return c.json({ error: cls.kind, message: cls.message }, 500)
      }
    }

    // ─── application/json: text / link / share ───────────────────
    const body = (await c.req.json().catch(() => null)) as Partial<{
      session_id: string | null
      type: IngestType
      raw_text: string
      file_url: string
      metadata: IngestMetadata
    }> | null

    if (!body || !body.type) {
      return c.json({ error: 'type_required' }, 400)
    }
    if (!VALID_TYPES.has(body.type)) {
      return c.json({ error: 'invalid_type' }, 400)
    }
    if (
      (body.type === 'text' || body.type === 'link' || body.type === 'share') &&
      !body.raw_text?.trim()
    ) {
      return c.json({ error: 'raw_text_required' }, 400)
    }

    if (body.session_id) {
      const exists = db
        .prepare('SELECT 1 FROM sessions WHERE id = ?')
        .get(body.session_id)
      if (!exists) return c.json({ error: 'session_not_found' }, 404)
    }

    const id = newId('ing')
    const now = new Date().toISOString()
    const metadata: IngestMetadata = {
      timestamp: now,
      ...body.metadata,
    }

    db.prepare(`
      INSERT INTO ingests (id, session_id, type, file_url, raw_text, metadata, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.session_id ?? null,
      body.type,
      body.file_url ?? null,
      body.raw_text ?? null,
      JSON.stringify(metadata),
      body.session_id ? 'routed' : 'pending',
      now,
    )

    const row = db
      .prepare('SELECT * FROM ingests WHERE id = ?')
      .get(id) as Parameters<typeof rowToIngest>[0]
    return c.json(rowToIngest(row), 201)
  })

  app.get('/:id', (c) => {
    const row = db
      .prepare('SELECT * FROM ingests WHERE id = ?')
      .get(c.req.param('id')) as Parameters<typeof rowToIngest>[0] | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json(rowToIngest(row))
  })

  return app
}
