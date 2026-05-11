// useLiveStream — minimal SSE consumer for POST endpoints.
//
// EventSource is GET-only, so we use fetch + ReadableStream and parse
// the SSE wire format ourselves. The format Hono emits is:
//
//   event: agent.text_delta
//   data: {"type":"agent.text_delta","text":"…"}
//
//   event: artifact.ready
//   data: {"type":"artifact.ready","artifact":{…}}
//
// Each event terminated by a blank line. We split on \n\n and parse.

import type { RunEvent } from '@shared/index'

export interface RunOptions {
  sessionId: string
  ingestId: string
  signal?: AbortSignal
  onEvent: (event: RunEvent) => void
}

export async function runAgent(options: RunOptions): Promise<void> {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: options.sessionId,
      ingest_id: options.ingestId,
    }),
    signal: options.signal,
  })

  if (!res.body) {
    throw new Error('no response body from /api/run')
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`/api/run failed: ${res.status} ${body}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Split into SSE events (separated by blank lines).
    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      handleSseChunk(rawEvent, options.onEvent)
    }
  }

  // Flush any trailing event.
  if (buffer.trim()) handleSseChunk(buffer, options.onEvent)
}

function handleSseChunk(
  chunk: string,
  onEvent: (event: RunEvent) => void,
): void {
  let dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
    // We could read 'event:' and 'id:' lines too, but the JSON `type`
    // field is authoritative here.
  }
  if (dataLines.length === 0) return
  try {
    const parsed = JSON.parse(dataLines.join('\n')) as RunEvent
    onEvent(parsed)
  } catch {
    // Drop malformed events — usually means a partial chunk slipped
    // past the splitter (rare with our \n\n delimiter, but possible).
  }
}
