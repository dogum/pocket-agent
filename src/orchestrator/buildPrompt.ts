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
  recentObservationsForSession,
  rowToArtifact,
  rowToIngest,
} from '../db.js'
import type {
  Artifact,
  Ingest,
  Observation,
  Session,
  Source,
} from '../../shared/index.js'

const RECENT_ARTIFACT_LIMIT = 5
const RECENT_INGEST_LIMIT = 5
const RECENT_OBSERVATIONS_PER_SOURCE = 5

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

  // ── Ambient observations from attached sources ──────────────────
  const observations = recentObservationsForSession(
    db,
    session.id,
    RECENT_OBSERVATIONS_PER_SOURCE,
  )
  const haveObservations = observations.some((o) => o.observations.length > 0)
  if (haveObservations) {
    lines.push('## Recent observations from attached sources')
    lines.push(
      'These are signals you receive between user turns. The user has not necessarily acted on them. You can pull on these threads — propose a reflex_proposal if a pattern repeats, or reference them in your artifact when relevant.',
    )
    lines.push('')
    lines.push('<recent_observations>')
    for (const { source, observations: list } of observations) {
      if (list.length === 0) continue
      lines.push(renderSourceObservations(source, list))
    }
    lines.push('</recent_observations>')
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

function renderSourceObservations(
  source: Source,
  observations: Observation[],
): string {
  const lines: string[] = []
  lines.push(`<source name="${source.name}" label="${source.label}">`)
  for (const o of observations) {
    lines.push(
      `  <observation at="${o.observed_at}" id="${o.id}">${escape(o.summary)}</observation>`,
    )
    // Include the JSON payload as a tight CDATA-ish block so the agent
    // can match conditions exactly when proposing reflexes / subscriptions.
    lines.push(
      `  <payload>${JSON.stringify(o.payload)}</payload>`,
    )
  }
  lines.push(`</source>`)
  return lines.join('\n')
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
