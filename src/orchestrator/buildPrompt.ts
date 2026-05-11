// =====================================================================
// buildPrompt — assemble the kickoff `user.message` for an agent run.
//
// We give the agent: the new ingest, the session's name + description,
// and a compact summary of recent ingests + artifacts so it has enough
// context to decide what to surface next without re-loading the world.
// =====================================================================

import type { Database as DB } from 'better-sqlite3'

import {
  getProfile,
  rowToArtifact,
  rowToIngest,
} from '../db.js'
import type { Artifact, Ingest, Session } from '../../shared/index.js'

const RECENT_ARTIFACT_LIMIT = 5
const RECENT_INGEST_LIMIT = 5

/** Truncate a long string to a token-friendly length, suffixed if cut. */
function truncate(s: string | null | undefined, max: number): string {
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function summarizeArtifact(a: Artifact): string {
  const summary = a.header.summary ? ` — ${a.header.summary}` : ''
  return `[${a.created_at.slice(0, 10)}] ${a.header.label}: ${a.header.title}${summary}`
}

function summarizeIngest(i: Ingest): string {
  const at = i.created_at.slice(0, 16)
  const preview = i.raw_text
    ? truncate(i.raw_text, 200)
    : i.metadata.file_name
      ? `(file: ${i.metadata.file_name})`
      : `(${i.type})`
  return `[${at}] ${i.type}: ${preview}`
}

export interface BuildPromptInput {
  session: Session
  ingest: Ingest
  db: DB
}

export interface BuildPromptResult {
  /** The kickoff text sent as user.message content. */
  text: string
  /** File ids attached as session resources, if any. */
  fileIds: string[]
}

export function buildPrompt({
  session,
  ingest,
  db,
}: BuildPromptInput): BuildPromptResult {
  const recentArtifacts = (
    db
      .prepare(
        'SELECT * FROM artifacts WHERE session_id = ? AND archived = 0 ORDER BY created_at DESC LIMIT ?',
      )
      .all(session.id, RECENT_ARTIFACT_LIMIT) as Parameters<typeof rowToArtifact>[0][]
  ).map(rowToArtifact)

  const recentIngests = (
    db
      .prepare(
        'SELECT * FROM ingests WHERE session_id = ? AND id != ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(session.id, ingest.id, RECENT_INGEST_LIMIT) as Parameters<typeof rowToIngest>[0][]
  ).map(rowToIngest)

  const profile = getProfile(db)
  const lines: string[] = []
  if (profile.name.trim()) {
    lines.push(`# User: ${profile.name.trim()}`)
    lines.push('')
  }
  lines.push(`# Session: ${session.name}`)
  if (session.description) lines.push(session.description)
  lines.push('')

  lines.push('## New input')
  lines.push(`Type: ${ingest.type}`)
  lines.push(`Received: ${ingest.created_at}`)
  if (ingest.raw_text) {
    lines.push('')
    lines.push('Content:')
    lines.push(ingest.raw_text)
  }
  if (ingest.metadata.file_name) {
    lines.push('')
    lines.push(
      `File mounted at /mnt/session/uploads/${ingest.metadata.file_name} (${ingest.metadata.mime_type ?? 'unknown'}, ${ingest.metadata.file_size ?? '?'} bytes)`,
    )
  }
  if (ingest.metadata.url) {
    lines.push('')
    lines.push(`URL: ${ingest.metadata.url}`)
  }
  lines.push('')

  if (recentArtifacts.length > 0) {
    lines.push('## Recent artifacts in this session')
    for (const a of recentArtifacts) lines.push(summarizeArtifact(a))
    lines.push('')
  }

  if (recentIngests.length > 0) {
    lines.push('## Recent inputs in this session')
    for (const i of recentIngests) lines.push(summarizeIngest(i))
    lines.push('')
  }

  lines.push('## Your task')
  lines.push(
    'Analyze the new input in the context of this session. Produce one Artifact JSON object as your final message — no preamble, no markdown fences, just the JSON.',
  )

  const fileIds: string[] = []
  if (ingest.metadata.file_id) fileIds.push(ingest.metadata.file_id)

  return { text: lines.join('\n'), fileIds }
}
