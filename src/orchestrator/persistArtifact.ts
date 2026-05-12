// =====================================================================
// persistArtifact — common artifact-persist helper used by both the
// user-driven /api/run endpoint and the server-initiated scheduler /
// reflex / artifact-update pipelines. Centralizes:
//
//   • Resolving `subscribes_to[].source_id` from a possible source_name.
//   • Snapshotting the initial state into artifact_versions[v=0].
//   • Computing version + last_updated_at correctly.
//
// Returns the persisted Artifact, ready to emit via SSE or the bus.
// =====================================================================

import type { Database as DB } from 'better-sqlite3'

import type {
  Artifact,
  ArtifactDraft,
  ArtifactSubscription,
} from '../../shared/index.js'
import { getSourceByName, getSource } from '../db.js'
import { newId } from '../lib/id.js'

export interface PersistArtifactInput {
  db: DB
  sessionId: string
  draft: ArtifactDraft
}

export function persistArtifact({
  db,
  sessionId,
  draft,
}: PersistArtifactInput): Artifact {
  const id = newId('art')
  const created_at = new Date().toISOString()

  // Resolve source_name → source_id on each subscription.
  const subs = resolveSubscriptions(db, draft.subscribes_to)

  db.prepare(`
    INSERT INTO artifacts (
      id, session_id, priority, notify, header, components, actions,
      subscribes_to, version, last_updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    draft.priority,
    draft.notify ? 1 : 0,
    JSON.stringify(draft.header),
    JSON.stringify(draft.components),
    JSON.stringify(draft.actions ?? []),
    JSON.stringify(subs),
    0,
    null,
    created_at,
  )

  // Anchor row in artifact_versions so the history sheet has v=0 to anchor on.
  db.prepare(`
    INSERT INTO artifact_versions (
      id, artifact_id, version, header, components,
      triggering_observation_id, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `av_0_${id}`,
    id,
    0,
    JSON.stringify(draft.header),
    JSON.stringify(draft.components),
    null,
    null,
    created_at,
  )

  return {
    id,
    session_id: sessionId,
    priority: draft.priority,
    notify: draft.notify,
    header: draft.header,
    components: draft.components,
    actions: draft.actions,
    subscribes_to: subs.length > 0 ? subs : undefined,
    version: 0,
    created_at,
  }
}

/** Agents emit `source_name` (the slug); persistence resolves to
 *  `source_id`. We accept both for forward compatibility — if the agent
 *  ever sees ids, we won't break. Unknown names are filtered out.
 *  Exported so agentUpdate can re-normalize on living-artifact updates
 *  too — otherwise the model could regress an artifact's subscriptions
 *  to slugs that `artifactsSubscribedToSource` can't match by id. */
export function resolveSubscriptions(
  db: DB,
  raw: ArtifactSubscription[] | undefined,
): ArtifactSubscription[] {
  if (!raw || raw.length === 0) return []
  const out: ArtifactSubscription[] = []
  for (const s of raw) {
    // First try as id, then fall back to name.
    const byId = s.source_id ? getSource(db, s.source_id) : null
    const source =
      byId ??
      (s.source_id
        ? getSourceByName(db, s.source_id)
        : null)
    if (!source) continue
    out.push({
      source_id: source.id,
      conditions: s.conditions,
    })
  }
  return out
}
