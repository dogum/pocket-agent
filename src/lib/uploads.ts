// =====================================================================
// Files API helpers — upload / cache / proxy.
//
// Why we cache bytes locally:
//   The Anthropic Files API refuses to re-download user-uploaded files
//   (only agent-produced files are downloadable). To preview a CSV the
//   user just dropped in, we need our own copy. We cache the original
//   bytes at `${UPLOAD_CACHE_DIR}/<file_id>` and serve previews from
//   there. Agent-produced files we fetch on demand via files.download().
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Database as DB } from 'better-sqlite3'

export interface UploadInput {
  client: Anthropic
  db: DB
  cacheDir: string
  file: File
  ingestId?: string
}

export interface UploadResult {
  fileId: string
  filename: string
  size: number
  mimeType: string
  cachePath: string
}

export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  const { client, db, cacheDir, file, ingestId } = input

  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true })

  // Forward to Anthropic Files API. Both betas: files-api lets us upload,
  // managed-agents lets us attach the resulting file_id as a session
  // resource without a re-permission step.
  const meta = await client.beta.files.upload(
    { file },
    {
      headers: {
        'anthropic-beta': 'files-api-2025-04-14,managed-agents-2026-04-01',
      },
    },
  )

  const arrayBuffer = await file.arrayBuffer()
  const bytes = Buffer.from(arrayBuffer)
  const cachePath = join(cacheDir, meta.id)
  await writeFile(cachePath, bytes)

  const filename = file.name || meta.filename || meta.id
  const mimeType = file.type || meta.mime_type || 'application/octet-stream'
  const size = file.size

  db.prepare(`
    INSERT INTO file_uploads (file_id, ingest_id, filename, size_bytes, mime_type, cache_path, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_id) DO UPDATE SET
      ingest_id = excluded.ingest_id,
      filename = excluded.filename,
      size_bytes = excluded.size_bytes,
      mime_type = excluded.mime_type,
      cache_path = excluded.cache_path
  `).run(
    meta.id,
    ingestId ?? null,
    filename,
    size,
    mimeType,
    cachePath,
    new Date().toISOString(),
  )

  return { fileId: meta.id, filename, size, mimeType, cachePath }
}

interface FileUploadRow {
  file_id: string
  ingest_id: string | null
  filename: string
  size_bytes: number
  mime_type: string
  cache_path: string | null
}

export async function getFileContent(
  client: Anthropic,
  db: DB,
  fileId: string,
): Promise<{ bytes: Buffer; mimeType: string; filename: string } | null> {
  const row = db
    .prepare('SELECT * FROM file_uploads WHERE file_id = ?')
    .get(fileId) as FileUploadRow | undefined

  if (row?.cache_path && existsSync(row.cache_path)) {
    const bytes = await readFile(row.cache_path)
    return { bytes, mimeType: row.mime_type, filename: row.filename }
  }

  // Cache miss — fall back to Files API. Useful for agent-produced
  // files (where downloadable=true) that we never had locally.
  try {
    const res = await client.beta.files.download(fileId, undefined, {
      headers: {
        'anthropic-beta': 'files-api-2025-04-14,managed-agents-2026-04-01',
      },
    })
    const blob = await res.blob()
    const bytes = Buffer.from(await blob.arrayBuffer())
    return {
      bytes,
      mimeType: blob.type || row?.mime_type || 'application/octet-stream',
      filename: row?.filename || fileId,
    }
  } catch {
    return null
  }
}
