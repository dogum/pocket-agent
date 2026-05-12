// =====================================================================
// agentUpdate — scoped artifact-in-place updates ("living artifacts").
//
// When an observation arrives on a source an artifact subscribes to,
// we re-run the agent with a tightly scoped system addendum: "update
// THIS artifact only, here is the new data, return a fresh artifact
// JSON that REPLACES the current state."
//
// We:
//   1. Enqueue an agent run on the artifact's session via the run queue
//      (priority 'artifact_update' — lowest priority so we never
//      starve the user or a reflex).
//   2. Build a focused prompt with the artifact's current rendered
//      markdown + the new observation.
//   3. Drain streamSession; parse the artifact JSON.
//   4. Call updateArtifactInPlace, which writes the new body and
//      snapshots the prior state into artifact_versions.
//   5. Publish artifact.updated on the bus.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { Database as DB } from 'better-sqlite3'

import type {
  Artifact,
  Observation,
  Source,
} from '../../shared/index.js'
import {
  rowToArtifact,
  rowToSession,
  updateArtifactInPlace,
} from '../db.js'
import { publish } from '../lib/eventBus.js'
import * as log from '../lib/log.js'
import { enqueueRun } from '../lib/runQueue.js'
import { resolveSubscriptions } from './persistArtifact.js'
import { streamSession } from './streamSession.js'

export interface UpdateArtifactFromObservationInput {
  db: DB
  client: Anthropic
  getAgent: () => { agent_id: string; environment_id: string } | null
  artifact: Artifact
  source: Source
  observation: Observation
}

export async function updateArtifactFromObservation(
  input: UpdateArtifactFromObservationInput,
): Promise<void> {
  const { db, client, getAgent, artifact, source, observation } = input

  // NOTE: `artifact` here is the snapshot at enqueue time. The QUEUED
  // run callback below re-reads the row before building the prompt, so
  // back-to-back observations don't run against stale components and
  // overwrite each other's updates. We only use this snapshot for the
  // (stable) session_id and the queue description.
  const description = `Update artifact: ${artifact.header.title}`
  await enqueueRun({
    sessionId: artifact.session_id,
    priority: 'artifact_update',
    description,
    run: async () => {
      const agent = getAgent()
      if (!agent) {
        log.warn('living-artifact · no agent provisioned')
        return
      }

      // Re-read the artifact NOW that we hold the per-session lock.
      // A prior queued run may have just updated it; the prompt and
      // the subscribes_to fallback both need the current state.
      const artifactRow = db
        .prepare('SELECT * FROM artifacts WHERE id = ?')
        .get(artifact.id) as Parameters<typeof rowToArtifact>[0] | undefined
      if (!artifactRow) {
        log.warn(
          `living-artifact · artifact ${artifact.id} vanished before update`,
        )
        return
      }
      const current = rowToArtifact(artifactRow)

      const sessionRow = db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(current.session_id) as
        | Parameters<typeof rowToSession>[0]
        | undefined
      if (!sessionRow) return
      const session = rowToSession(sessionRow)

      const promptText = buildUpdatePrompt({
        artifact: current,
        source,
        observation,
      })

      const gen = streamSession({
        client,
        agentId: agent.agent_id,
        environmentId: agent.environment_id,
        localSessionId: session.id,
        promptText,
        fileIds: [],
        title: `[update] ${current.header.title}`,
        existingManagedSessionId: session.managed_session_id ?? undefined,
      })

      let result = await gen.next()
      while (!result.done) {
        publish({
          type: 'run',
          event: result.value,
          session_id: session.id,
          priority: 'artifact_update',
        })
        result = await gen.next()
      }
      const final = result.value

      if (final.managedSessionId) {
        db.prepare(
          'UPDATE sessions SET managed_session_id = ?, run_status = ? WHERE id = ?',
        ).run(
          final.managedSessionId,
          final.exitReason === 'end_turn' ? 'idle' : final.exitReason,
          session.id,
        )
      }

      if (final.exitReason !== 'end_turn' || !final.draft) {
        log.warn(
          `living-artifact · update did not produce a draft (${final.exitReason})`,
        )
        return
      }

      // Re-use the CURRENT artifact's subscribes_to unless the agent
      // explicitly overrides — that keeps the watcher attached after the
      // update. The agent CAN clear it by setting subscribes_to: [].
      // Normalize through resolveSubscriptions so any source_name slugs
      // the model emits get mapped back to canonical source_ids; without
      // this the next fan-out via artifactsSubscribedToSource (which
      // matches on source_id) would silently stop firing.
      const newSubsRaw = final.draft.subscribes_to ?? current.subscribes_to
      const newSubs = resolveSubscriptions(db, newSubsRaw)
      const updated = updateArtifactInPlace(db, current.id, {
        header: final.draft.header,
        components: final.draft.components,
        actions: final.draft.actions,
        subscribes_to: newSubs,
        triggering_observation_id: observation.id,
        reason: `Updated from ${source.name}: ${observation.summary}`,
      })

      if (!updated) {
        log.warn(`living-artifact · artifact ${artifact.id} vanished mid-update`)
        return
      }

      publish({
        type: 'artifact.updated',
        artifact: updated.artifact,
        triggering_observation_id: observation.id,
      })
      log.ok(
        `living-artifact · "${updated.artifact.header.title}" → v${updated.version}`,
      )
    },
  })
}

function buildUpdatePrompt(input: {
  artifact: Artifact
  source: Source
  observation: Observation
}): string {
  const { artifact, source, observation } = input
  return `You are updating an existing artifact in place. A source this artifact subscribes to has emitted a new observation. Refresh the artifact's body so it reflects the new state, keeping its identity (label / title / general role) coherent unless the new state genuinely changes its purpose.

## The artifact's current state

Label: ${artifact.header.label}
Title: ${artifact.header.title}
Summary: ${artifact.header.summary ?? '(none)'}
Version: ${artifact.version ?? 0}

Components (verbatim):
\`\`\`json
${JSON.stringify(artifact.components, null, 2)}
\`\`\`

It currently subscribes to: ${(artifact.subscribes_to ?? [])
    .map((s) => s.source_id)
    .join(', ') || '(no subscriptions)'}

## The new observation

Source: ${source.name} (${source.label})
Observed at: ${observation.observed_at}
Summary: ${observation.summary}

Payload:
\`\`\`json
${JSON.stringify(observation.payload, null, 2)}
\`\`\`

## Your task

Return a FRESH Artifact JSON that REPLACES the current state, integrating the new observation. Same header label and broadly-similar title (you can tweak the timestamp). Keep \`subscribes_to\` unchanged unless the artifact's purpose has genuinely shifted. Return only the JSON object as your final message — no preamble.`
}
