// =====================================================================
// eventBus — server-side fan-out for ambient events.
//
// The /api/events SSE route subscribes here; orchestrator code publishes
// to it (observation.received, reflex.fired, artifact.updated, …) so
// the web client learns about activity that didn't originate in a
// /api/run stream.
//
// Single-process only — no Redis, no IPC. We're a local-first app.
// =====================================================================

import type {
  ArtifactUpdatedEvent,
  ObservationReceivedEvent,
  ReflexFiredEvent,
  RunEvent,
} from '../../shared/index.js'

export type AmbientEvent =
  | ObservationReceivedEvent
  | ReflexFiredEvent
  | ArtifactUpdatedEvent
  | RunStartedAmbient
  | RunFinishedAmbient
  // Forwarded run events so the client can mirror server-initiated
  // runs in its UI (banner, scan-bar, transcript).
  | { type: 'run'; event: RunEvent; session_id: string; priority: string }

export interface RunStartedAmbient {
  type: 'queue.run_started'
  session_id: string
  priority: string
  description?: string
  started_at: string
}

export interface RunFinishedAmbient {
  type: 'queue.run_finished'
  session_id: string
  priority: string
  description?: string
  finished_at: string
  ok: boolean
}

type Listener = (e: AmbientEvent) => void

const listeners = new Set<Listener>()

export function publish(event: AmbientEvent): void {
  for (const fn of listeners) {
    try {
      fn(event)
    } catch {
      // A misbehaving listener shouldn't block fan-out.
    }
  }
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function listenerCount(): number {
  return listeners.size
}
