// =====================================================================
// observations — write path + fan-out.
//
// Every observation a source produces flows through `ingestObservation`:
//
//   1. Persist + trim the source's ring buffer (db helper).
//   2. Publish `observation.received` on the event bus so the UI can
//      reflect it without a poll.
//   3. Run the reflex evaluator → enqueue any matching reflex fires.
//   4. Run the artifact subscription evaluator → enqueue any matching
//      artifact updates.
//
// Steps 3 + 4 are event-driven (no cron), debounced where appropriate,
// and route through the shared per-session run queue so they don't
// collide with user ingests.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { Database as DB } from 'better-sqlite3'

import {
  evaluateConditions,
  type Observation,
  type Source,
} from '../../shared/index.js'
import {
  activeReflexesForSource,
  artifactsSubscribedToSource,
  recordObservation,
  reserveReflexFire,
} from '../db.js'
import { publish } from '../lib/eventBus.js'
import * as log from '../lib/log.js'
import { fireReflex } from './reflexEval.js'
import { updateArtifactFromObservation } from './agentUpdate.js'

export interface IngestObservationDeps {
  db: DB
  client: Anthropic
  getAgent: () => { agent_id: string; environment_id: string } | null
}

export interface IngestObservationInput {
  source: Source
  payload: Record<string, unknown>
  summary: string
}

/** Persist an observation and trigger fan-out to reflexes + living
 *  artifacts. Returns the persisted Observation row. */
export function ingestObservation(
  deps: IngestObservationDeps,
  input: IngestObservationInput,
): Observation {
  const obs: Observation = {
    id: newObservationId(),
    source_id: input.source.id,
    observed_at: new Date().toISOString(),
    payload: input.payload,
    summary: input.summary,
  }
  recordObservation(deps.db, obs)

  publish({
    type: 'observation.received',
    source_id: obs.source_id,
    observation_id: obs.id,
    observed_at: obs.observed_at,
    summary: obs.summary,
  })

  // ── Reflex fan-out ────────────────────────────────────────────────
  // Debounce check is done up-front AND the reservation is persisted
  // before enqueueing, so a burst of observations during a single in-
  // flight run can't queue duplicate fires. `last_fired_at` here means
  // "when the system most recently decided to fire" — fire_count still
  // only increments after a successful run completes.
  const reflexes = activeReflexesForSource(deps.db, input.source.id)
  const now = Date.now()
  for (const reflex of reflexes) {
    if (reflex.last_fired_at) {
      const since = now - Date.parse(reflex.last_fired_at)
      if (since < reflex.debounce_seconds * 1000) continue
    }
    if (!evaluateConditions(reflex.match.conditions, obs.payload)) continue

    // Reserve the debounce slot synchronously via a targeted UPDATE
    // (only touches last_fired_at / updated_at) so a concurrent user
    // PATCH against match / approved / enabled isn't reverted by our
    // write. The next observation within debounce_seconds will see
    // this last_fired_at and skip.
    reserveReflexFire(deps.db, reflex.id)
    const reserved = {
      ...reflex,
      last_fired_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Schedule the fire — don't await, let the queue serialize.
    void fireReflex({
      db: deps.db,
      client: deps.client,
      getAgent: deps.getAgent,
      reflex: reserved,
      source: input.source,
      observation: obs,
    }).catch((err: unknown) => {
      log.fail(
        `reflex · fire failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
  }

  // ── Subscribed-artifact fan-out ───────────────────────────────────
  const artifacts = artifactsSubscribedToSource(deps.db, input.source.id)
  for (const artifact of artifacts) {
    const sub = artifact.subscribes_to?.find(
      (s) => s.source_id === input.source.id,
    )
    if (!sub) continue
    if (sub.conditions && !evaluateConditions(sub.conditions, obs.payload)) {
      continue
    }
    void updateArtifactFromObservation({
      db: deps.db,
      client: deps.client,
      getAgent: deps.getAgent,
      artifact,
      source: input.source,
      observation: obs,
    }).catch((err: unknown) => {
      log.fail(
        `living-artifact · update failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
  }

  return obs
}

function newObservationId(): string {
  return `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
