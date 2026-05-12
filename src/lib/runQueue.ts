// =====================================================================
// runQueue — per-session, priority-sorted serializer for agent runs.
//
// Every server-initiated agent run (user ingest, scheduled trigger,
// reflex fire, artifact update) goes through `enqueueRun`. At most one
// job per session runs at a time. Pending jobs are sorted by
// PRIORITY_ORDER (user < trigger < reflex < artifact_update), with FIFO
// among ties.
//
// We publish queue events to the eventBus so the UI banner can say
// "agent is on a reflex" / "agent updating an artifact" / etc.
// =====================================================================

import {
  PRIORITY_ORDER,
  priorityBanner,
  type RunPriority,
} from '../../shared/index.js'
import { publish } from './eventBus.js'

interface Job {
  sessionId: string
  priority: RunPriority
  description?: string
  enqueuedAt: number
  run: () => Promise<void>
  resolve: () => void
  reject: (err: unknown) => void
}

interface Slot {
  running: Job | null
  pending: Job[]
}

const slots = new Map<string, Slot>()

function getSlot(sessionId: string): Slot {
  let s = slots.get(sessionId)
  if (!s) {
    s = { running: null, pending: [] }
    slots.set(sessionId, s)
  }
  return s
}

export interface EnqueueRunInput {
  sessionId: string
  priority: RunPriority
  /** Short banner-friendly hint. */
  description?: string
  /** The actual run body. Must resolve when the run is complete. */
  run: () => Promise<void>
}

export function enqueueRun(input: EnqueueRunInput): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const slot = getSlot(input.sessionId)
    const job: Job = {
      sessionId: input.sessionId,
      priority: input.priority,
      description: input.description,
      enqueuedAt: Date.now(),
      run: input.run,
      resolve,
      reject,
    }
    slot.pending.push(job)
    slot.pending.sort(comparePriority)
    drain(input.sessionId)
  })
}

function comparePriority(a: Job, b: Job): number {
  const pa = PRIORITY_ORDER[a.priority]
  const pb = PRIORITY_ORDER[b.priority]
  if (pa !== pb) return pa - pb
  return a.enqueuedAt - b.enqueuedAt
}

function drain(sessionId: string): void {
  const slot = slots.get(sessionId)
  if (!slot || slot.running) return
  const next = slot.pending.shift()
  if (!next) {
    // Nothing running, nothing pending — drop the slot so a session
    // that ever enqueued a single run doesn't leave a permanent empty
    // entry. Without this, `slots` grows unbounded for the lifetime
    // of the server (and so does the /api/events queue.state payload).
    slots.delete(sessionId)
    return
  }
  slot.running = next

  publish({
    type: 'queue.run_started',
    session_id: next.sessionId,
    priority: next.priority,
    description: next.description ?? priorityBanner(next.priority),
    started_at: new Date().toISOString(),
  })

  next
    .run()
    .then(
      () => {
        slot.running = null
        next.resolve()
        publish({
          type: 'queue.run_finished',
          session_id: next.sessionId,
          priority: next.priority,
          description: next.description ?? priorityBanner(next.priority),
          finished_at: new Date().toISOString(),
          ok: true,
        })
        drain(sessionId)
      },
      (err) => {
        slot.running = null
        next.reject(err)
        publish({
          type: 'queue.run_finished',
          session_id: next.sessionId,
          priority: next.priority,
          description: next.description ?? priorityBanner(next.priority),
          finished_at: new Date().toISOString(),
          ok: false,
        })
        drain(sessionId)
      },
    )
}

export function queueState(): Array<{
  session_id: string
  running: { priority: RunPriority; description?: string } | null
  pending: Array<{ priority: RunPriority; description?: string }>
}> {
  const out: Array<{
    session_id: string
    running: { priority: RunPriority; description?: string } | null
    pending: Array<{ priority: RunPriority; description?: string }>
  }> = []
  for (const [sessionId, slot] of slots) {
    out.push({
      session_id: sessionId,
      running: slot.running
        ? {
            priority: slot.running.priority,
            description: slot.running.description,
          }
        : null,
      pending: slot.pending.map((j) => ({
        priority: j.priority,
        description: j.description,
      })),
    })
  }
  return out
}
