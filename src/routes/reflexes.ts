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

export function reflexesRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const sessionId = c.req.param('sessionId') as string
    return c.json({ reflexes: listReflexesForSession(db, sessionId) })
  })

  app.post('/', async (c) => {
    const sessionId = c.req.param('sessionId') as string
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

    let match = body.match
    if (!match && body.source_name) {
      const source = getSourceByName(db, body.source_name)
      if (!source) {
        return c.json(
          { error: `source "${body.source_name}" not found` },
          404,
        )
      }
      match = { source_id: source.id, conditions: [] }
    }
    if (!match) {
      return c.json({ error: 'match or source_name is required' }, 400)
    }
    // Allow match.source_id to be a source name as well — resolve.
    const sourceRef = match.source_id
    if (!sourceRef || !getSource(db, sourceRef)) {
      const bySlug = sourceRef ? getSourceByName(db, sourceRef) : null
      if (!bySlug) {
        return c.json(
          { error: `match.source_id "${sourceRef ?? ''}" not found` },
          404,
        )
      }
      match = { source_id: bySlug.id, conditions: match.conditions ?? [] }
    }

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
    const id = c.req.param('id')
    const reflex = getReflex(db, id)
    if (!reflex) return c.json({ error: 'not_found' }, 404)
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      description: string
      match: ReflexMatch
      kickoff_prompt: string
      artifact_hint: string
      debounce_seconds: number
      approved: boolean
      enabled: boolean
    }>
    const next: Reflex = {
      ...reflex,
      description: body.description ?? reflex.description,
      match: body.match ?? reflex.match,
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
    const id = c.req.param('id')
    if (!getReflex(db, id)) return c.json({ error: 'not_found' }, 404)
    deleteReflex(db, id)
    return c.json({ ok: true })
  })

  return app
}
