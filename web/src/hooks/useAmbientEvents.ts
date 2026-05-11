// =====================================================================
// useAmbientEvents — single long-lived EventSource on /api/events.
//
// This is how the client learns about server-initiated activity:
// observations arriving, reflexes firing, artifacts updating in place,
// and the run queue starting / finishing work that didn't originate
// in /api/run.
//
// Mounted once at the app root.
// =====================================================================

import { useEffect } from 'react'

import type {
  ArtifactUpdatedEvent,
  ObservationReceivedEvent,
  ReflexFiredEvent,
  RunEvent,
} from '@shared/index'
import { useAppStore } from '../store/useAppStore'

type RunFanout = {
  type: 'run'
  event: RunEvent
  session_id: string
  priority: string
}

type QueueStarted = {
  type: 'queue.run_started'
  session_id: string
  priority: string
  description?: string
  started_at: string
}

type QueueFinished = {
  type: 'queue.run_finished'
  session_id: string
  priority: string
  description?: string
  finished_at: string
  ok: boolean
}

type QueueStateSnapshot = {
  runs: Array<{
    session_id: string
    running: { priority: string; description?: string } | null
    pending: Array<{ priority: string; description?: string }>
  }>
}

type ParsedEvent =
  | ObservationReceivedEvent
  | ReflexFiredEvent
  | ArtifactUpdatedEvent
  | RunFanout
  | QueueStarted
  | QueueFinished
  | { type: 'queue.state'; payload: QueueStateSnapshot }

export function useAmbientEvents(): void {
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const setAmbientRun = useAppStore((s) => s.setAmbientRun)

  useEffect(() => {
    const src = new EventSource('/api/events')

    const handle = (e: MessageEvent, override?: ParsedEvent['type']): void => {
      try {
        const data = JSON.parse(e.data) as Record<string, unknown>
        const type = override ?? (data.type as ParsedEvent['type'])
        switch (type) {
          case 'observation.received':
            // No-op in the global store. Source-detail screens refetch
            // when they're open (and could subscribe directly if needed).
            break
          case 'reflex.fired':
            // Same — handled by per-session reflexes UI on focus.
            break
          case 'artifact.updated': {
            const evt = data as unknown as ArtifactUpdatedEvent
            upsertArtifact(evt.artifact)
            break
          }
          case 'run': {
            const evt = data as unknown as RunFanout
            // For now we let the standard run.* mirroring happen via
            // the regular feed refresh + artifact.ready upserts when
            // forwarded. The banner is driven by queue.run_* events.
            if (evt.event.type === 'artifact.ready') {
              upsertArtifact(evt.event.artifact)
            }
            break
          }
          case 'queue.run_started': {
            const evt = data as unknown as QueueStarted
            // Don't override a user run — those are the loudest signal
            // already (the /api/run SSE stream owns the foreground).
            if (evt.priority === 'user') break
            setAmbientRun({
              session_id: evt.session_id,
              priority: evt.priority,
              description: evt.description ?? 'Agent is working',
            })
            break
          }
          case 'queue.run_finished': {
            const evt = data as unknown as QueueFinished
            if (evt.priority === 'user') break
            setAmbientRun(null)
            break
          }
          case 'queue.state': {
            // Snapshot at connect. Reflect the highest-priority running
            // non-user job, if any.
            const snap = (data as unknown) as QueueStateSnapshot
            const running = snap.runs
              .map((r) => r.running)
              .filter(
                (r): r is { priority: string; description?: string } =>
                  r !== null && r.priority !== 'user',
              )[0]
            if (running) {
              const r = snap.runs.find((x) => x.running === running)!
              setAmbientRun({
                session_id: r.session_id,
                priority: running.priority,
                description: running.description ?? 'Agent is working',
              })
            } else {
              setAmbientRun(null)
            }
            break
          }
        }
      } catch {
        // Malformed event — ignore.
      }
    }

    // Named events from streamSSE map to addEventListener handlers.
    const handlers: Array<[string, (e: MessageEvent) => void]> = [
      ['observation.received', (e) => handle(e, 'observation.received')],
      ['reflex.fired', (e) => handle(e, 'reflex.fired')],
      ['artifact.updated', (e) => handle(e, 'artifact.updated')],
      ['run', (e) => handle(e, 'run')],
      ['queue.run_started', (e) => handle(e, 'queue.run_started')],
      ['queue.run_finished', (e) => handle(e, 'queue.run_finished')],
      ['queue.state', (e) => handle(e, 'queue.state')],
    ]
    for (const [name, fn] of handlers) src.addEventListener(name, fn)

    return () => {
      for (const [name, fn] of handlers) src.removeEventListener(name, fn)
      src.close()
      setAmbientRun(null)
    }
  }, [upsertArtifact, setAmbientRun])
}
