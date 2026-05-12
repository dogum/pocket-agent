// =====================================================================
// /api/reflexes — manage agent-authored watchers.
//
//   GET    /api/sessions/:sessionId/reflexes     — list per session
//   POST   /api/sessions/:sessionId/reflexes     — create (from a UI form
//                                                   OR from an approved
//                                                   reflex_proposal)
//   PATCH  /api/sessions/:sessionId/reflexes/:id — update (approve, pause,
//                                                   tweak debounce, edit prompt)
//   DELETE /api/sessions/:sessionId/reflexes/:id — remove
//
// Reflexes that are `approved && enabled` and whose match.source_id
// resolves get fired by the observation pipeline (see observations.ts).
// =====================================================================

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import type {
  Reflex,
  ReflexMatch,
} from '../../shared/index.js'
import {
  deleteReflex,
  getReflex,
  getSource,
  getSourceByName,
  insertReflex,
  listReflexesForSession,
  updateReflex,
} from '../db.js'
import { newId } from '../lib/id.js'
import { parseConditions } from '../orchestrator/parseArtifact.js'

/** Validate + canonicalize a user-supplied match payload. Resolves a
 *  source slug to the canonical source_id and rejects malformed
 *  conditions before they can reach evaluateConditions on the hot
 *  observation-fan-out path. */
function validateMatch(
  db: DB,
  raw: unknown,
):
  | { ok: true; match: ReflexMatch }
  | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'match must be an object' }
  }
  const m = raw as Record<string, unknown>
  if (typeof m.source_id !== 'string' || !m.source_id.trim()) {
    return { ok: false, error: 'match.source_id is required' }
  }
  const source = getSource(db, m.source_id) ?? getSourceByName(db, m.source_id)
  if (!source) {
    return { ok: false, error: `source "${m.source_id}" not found` }
  }
  const condsRaw = m.conditions ?? []
  if (!Array.isArray(condsRaw)) {
    return { ok: false, error: 'match.conditions must be an array' }
  }
  const parsed = parseConditions(condsRaw, 'match')
  if (!parsed.ok) return parsed
  return {
    ok: true,
    match: { source_id: source.id, conditions: parsed.conditions },
  }
}

export function reflexesRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const sessionId = c.req.param('sessionId') as string
    return c.json({ reflexes: listReflexesForSession(db, sessionId) })
  })

  app.post('/', async (c) => {
    const sessionId = c.req.param('sessionId') as string
    // FK on reflexes.session_id would surface as an unhandled 500 if
    // the parent session is missing — check explicitly and return 404.
    const sessionRow = db
      .prepare('SELECT id FROM sessions WHERE id = ?')
      .get(sessionId)
    if (!sessionRow) {
      return c.json({ error: 'session_not_found' }, 404)
    }

    const body = (await c.req.json().catch(() => null)) as Partial<{
      description: string
      match: ReflexMatch
      /** Alias when creating from a reflex_proposal — agent emitted source_name. */
      source_name: string
      kickoff_prompt: string
      artifact_hint: string
      debounce_seconds: number
      approved: boolean
    }> | null

    if (!body?.description || !body.kickoff_prompt) {
      return c.json(
        { error: 'description and kickoff_prompt are required' },
        400,
      )
    }

    // Accept either an explicit `match` object or a bare `source_name`
    // (which reflex_proposal cards emit on Approve). Normalize either
    // into a match before validating.
    let rawMatch: unknown = body.match
    if (!rawMatch && body.source_name) {
      rawMatch = { source_id: body.source_name, conditions: [] }
    }
    if (!rawMatch) {
      return c.json({ error: 'match or source_name is required' }, 400)
    }
    const matchResult = validateMatch(db, rawMatch)
    if (!matchResult.ok) {
      return c.json({ error: matchResult.error }, 400)
    }
    const match = matchResult.match

    const now = new Date().toISOString()
    const description = body.description
    const kickoff_prompt = body.kickoff_prompt
    const reflex: Reflex = {
      id: newId('rfl'),
      session_id: sessionId,
      description,
      match,
      kickoff_prompt,
      artifact_hint: body.artifact_hint,
      debounce_seconds: body.debounce_seconds ?? 300,
      fire_count: 0,
      approved: body.approved ?? false,
      enabled: true,
      created_at: now,
      updated_at: now,
    }
    insertReflex(db, reflex)
    return c.json(reflex, 201)
  })

  app.patch('/:id', async (c) => {
    const sessionId = c.req.param('sessionId') as string
    const id = c.req.param('id')
    const reflex = getReflex(db, id)
    // Treat cross-session lookups as not_found so a leaked id from
    // another session can't mutate this session's automation state.
    if (!reflex || reflex.session_id !== sessionId) {
      return c.json({ error: 'not_found' }, 404)
    }
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      description: string
      match: unknown
      kickoff_prompt: string
      artifact_hint: string
      debounce_seconds: number
      approved: boolean
      enabled: boolean
    }>

    // If the caller is changing the match, validate + canonicalize it
    // first. A malformed payload (non-array conditions, bad source ref,
    // unknown op) would otherwise reach evaluateConditions on the
    // observation hot path and could crash an interval-driven producer.
    let nextMatch = reflex.match
    if (body.match !== undefined) {
      const result = validateMatch(db, body.match)
      if (!result.ok) {
        return c.json({ error: result.error }, 400)
      }
      nextMatch = result.match
    }

    const next: Reflex = {
      ...reflex,
      description: body.description ?? reflex.description,
      match: nextMatch,
      kickoff_prompt: body.kickoff_prompt ?? reflex.kickoff_prompt,
      artifact_hint:
        body.artifact_hint === undefined
          ? reflex.artifact_hint
          : body.artifact_hint || undefined,
      debounce_seconds: body.debounce_seconds ?? reflex.debounce_seconds,
      approved:
        typeof body.approved === 'boolean' ? body.approved : reflex.approved,
      enabled:
        typeof body.enabled === 'boolean' ? body.enabled : reflex.enabled,
      updated_at: new Date().toISOString(),
    }
    updateReflex(db, next)
    return c.json(getReflex(db, id))
  })

  app.delete('/:id', (c) => {
    const sessionId = c.req.param('sessionId') as string
    const id = c.req.param('id')
    const reflex = getReflex(db, id)
    if (!reflex || reflex.session_id !== sessionId) {
      return c.json({ error: 'not_found' }, 404)
    }
    deleteReflex(db, id)
    return c.json({ ok: true })
  })

  return app
}
