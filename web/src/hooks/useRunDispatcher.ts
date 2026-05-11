// useRunDispatcher — single entry point for kicking off a run and
// piping its events into the app store.
//
// Components call `dispatch(sessionId, ingestId)` after a successful
// ingest. The dispatcher serializes runs through the store's queue:
//   • If no run is active, it starts immediately.
//   • If a run IS active, the request is enqueued and runs after.
// On run.done it drains the queue.
//
// One in-flight run at a time. We never abort a running stream because
// the agent on the Anthropic side keeps going regardless — aborting the
// fetch only loses the events. Better to wait it out cleanly.

import { useCallback, useEffect, useRef } from 'react'

import type { RunEvent } from '@shared/index'
import { runAgent } from './useLiveStream'
import { api } from '../lib/api'
import { notifyArtifact } from '../lib/notifications'
import { useAppStore } from '../store/useAppStore'

export interface RunDispatcher {
  /** Start a run, or queue it if one is already running. */
  dispatch: (sessionId: string, ingestId: string) => Promise<void>
  /** Cancel the in-flight stream consumer (the server-side agent keeps going). */
  abort: () => void
}

export function useRunDispatcher(): RunDispatcher {
  const setRun = useAppStore((s) => s.setRun)
  const clearRun = useAppStore((s) => s.clearRun)
  const upsertArtifact = useAppStore((s) => s.upsertArtifact)
  const setData = useAppStore((s) => s.setData)

  // Refs for synchronous decisions (state updates are async).
  const ctrlRef = useRef<AbortController | null>(null)
  const runningRef = useRef(false)

  const onEvent = useCallback(
    (e: RunEvent): void => {
      switch (e.type) {
        case 'run.started':
          setRun({ activeRunId: e.run_id, liveText: '', liveTool: null })
          break
        case 'agent.text_delta':
          setRun({
            liveText: useAppStore.getState().liveText + e.text,
          })
          break
        case 'agent.tool_use':
          setRun({ liveTool: e.brief ? `${e.tool}: ${e.brief}` : e.tool })
          break
        case 'artifact.ready':
          upsertArtifact(e.artifact)
          notifyArtifact(e.artifact, {
            onClick: (id) =>
              useAppStore.getState().go({ name: 'artifact', id }),
          })
          void api
            .listSessions()
            .then(({ sessions }) => setData({ sessions }))
            .catch(() => {})
          break
        case 'run.error':
          // eslint-disable-next-line no-console
          console.error('run error', e)
          break
        case 'run.done':
          // Handled by `runOne` finally below.
          break
        default:
          break
      }
    },
    [setRun, upsertArtifact, setData],
  )

  // Run one item end-to-end, then drain the queue.
  const runOne = useCallback(
    async (sessionId: string, ingestId: string): Promise<void> => {
      runningRef.current = true
      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      try {
        await runAgent({
          sessionId,
          ingestId,
          signal: ctrl.signal,
          onEvent,
        })
      } catch (err) {
        if (!ctrl.signal.aborted) {
          // eslint-disable-next-line no-console
          console.error('run dispatch failed', err)
        }
      } finally {
        clearRun()
        ctrlRef.current = null
        runningRef.current = false
      }

      // Drain — pop the next queued run and recurse.
      const next = useAppStore.getState().dequeueRun()
      if (next) {
        void runOne(next.sessionId, next.ingestId)
      }
    },
    [onEvent, clearRun],
  )

  const dispatch = useCallback(
    async (sessionId: string, ingestId: string): Promise<void> => {
      // If we're already running OR the store says there's an activeRunId
      // (e.g. another tab/dispatcher), queue it.
      if (runningRef.current || useAppStore.getState().activeRunId) {
        useAppStore.getState().enqueueRun({ sessionId, ingestId })
        return
      }
      await runOne(sessionId, ingestId)
    },
    [runOne],
  )

  const abort = useCallback((): void => {
    ctrlRef.current?.abort()
    ctrlRef.current = null
    runningRef.current = false
    clearRun()
  }, [clearRun])

  useEffect(() => {
    return () => {
      ctrlRef.current?.abort()
    }
  }, [])

  return { dispatch, abort }
}
