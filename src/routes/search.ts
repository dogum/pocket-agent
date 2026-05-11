// /api/search — full-text query over the artifacts_fts virtual table.
//
// FTS5 returns ranked rows. We hydrate each match into a normal Artifact
// plus a snippet showing the matched terms in context.

import { Hono } from 'hono'
import type { Database as DB } from 'better-sqlite3'

import { rowToArtifact } from '../db.js'
import type { Artifact } from '../../shared/index.js'

export interface SearchHit {
  artifact: Artifact
  /** SQLite-rendered snippet with <mark>…</mark> around matched terms. */
  snippet: string
  /** Lower is better; FTS5 bm25 score. */
  rank: number
}

interface FtsRow {
  artifact_id: string
  rank: number
  snippet: string
}

/** Sanitize user input so we don't pass FTS operators they didn't mean.
 *  The default `bm25` and column filters can blow up on unbalanced quotes
 *  or stray colons. We strip everything but word characters and turn it
 *  into a prefix match per term — close enough to "what they expected." */
function escapeFtsQuery(raw: string): string {
  const tokens = raw
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `"${t}"*`).join(' ')
}

export function searchRoutes(db: DB): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const query = c.req.query('q')?.trim() ?? ''
    const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') || 20)))

    if (!query) return c.json({ hits: [], query })

    const fts = escapeFtsQuery(query)
    if (!fts) return c.json({ hits: [], query })

    const ftsRows = db
      .prepare(`
        SELECT artifact_id, rank,
               snippet(artifacts_fts, -1, '<mark>', '</mark>', '…', 18) AS snippet
        FROM artifacts_fts
        WHERE artifacts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `)
      .all(fts, limit) as FtsRow[]

    const hits: SearchHit[] = []
    for (const row of ftsRows) {
      const artRow = db
        .prepare('SELECT * FROM artifacts WHERE id = ? AND archived = 0')
        .get(row.artifact_id) as Parameters<typeof rowToArtifact>[0] | undefined
      if (!artRow) continue
      hits.push({
        artifact: rowToArtifact(artRow),
        snippet: row.snippet,
        rank: row.rank,
      })
    }

    return c.json({ hits, query })
  })

  return app
}
