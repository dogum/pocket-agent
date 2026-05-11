// =====================================================================
// mcpClient — long-lived MCP server clients (one per Source row).
//
// MCP sources connect once at boot, subscribe to the configured event
// topics, and emit Observations into the pipeline when messages arrive.
// On a dropped connection the wrapper backs off and reconnects.
//
// IMPLEMENTATION NOTE: This is a skeleton. The full wire-up uses
// @modelcontextprotocol/sdk with Streamable HTTP transport, which we
// have not yet added as a dependency. Until then, MCP sources stay in
// `configuring` status with a clear message in `last_error`. The
// architecture above (Source/Observation/Reflex/subscribes_to) is
// already MCP-shaped — switching this stub for a real client is a
// drop-in change with no cascading work elsewhere.
// =====================================================================

import type Anthropic from '@anthropic-ai/sdk'
import type { Database as DB } from 'better-sqlite3'

import type { Source, SourceMcpConfig } from '../../shared/index.js'
import { listSources, updateSource } from '../db.js'
import * as log from '../lib/log.js'

interface ClientHandle {
  source_id: string
  /** Reserved for the SDK's `Client` instance once we wire it. */
  client: null
  /** Backoff state for reconnect attempts. */
  backoff_ms: number
  /** True once we know the wire is alive. */
  connected: boolean
  /** Last error message, surfaced into Source.last_error. */
  error?: string
  /** Setinterval handle for backoff retry, if any. */
  retryTimer?: NodeJS.Timeout
}

const clients = new Map<string, ClientHandle>()

export interface McpClientDeps {
  db: DB
  /** Reserved — once we add the SDK, the agent client may be useful for
   *  forwarding tool calls; for now MCP servers only emit observations. */
  client: Anthropic
}

let depsRef: McpClientDeps | null = null

export function initMcpClients(deps: McpClientDeps): void {
  depsRef = deps
  reconcile()
}

/** Re-read the sources table and bring every kind='mcp', enabled=true
 *  row online (creating clients), and shut down any rows that have
 *  been deleted or disabled. */
export function reconcile(): void {
  if (!depsRef) return
  const { db } = depsRef
  const mcpSources = listSources(db).filter(
    (s) => s.kind === 'mcp' && s.enabled,
  )

  // Stop clients for sources that vanished or got disabled.
  const liveIds = new Set(mcpSources.map((s) => s.id))
  for (const [id, handle] of clients) {
    if (!liveIds.has(id)) {
      teardown(handle)
      clients.delete(id)
    }
  }

  // Start clients for newly-enabled sources.
  for (const source of mcpSources) {
    if (!clients.has(source.id)) {
      const handle: ClientHandle = {
        source_id: source.id,
        client: null,
        backoff_ms: 1000,
        connected: false,
      }
      clients.set(source.id, handle)
      attemptConnect(source, handle)
    }
  }
}

function attemptConnect(source: Source, handle: ClientHandle): void {
  if (!depsRef) return
  const config = source.config as SourceMcpConfig

  // ─── Skeleton wire-up ──────────────────────────────────────────────
  // When the MCP SDK lands, replace this block with:
  //   const client = new Client({ name: 'pocket-agent', version: '0.1.0' })
  //   const transport = new StreamableHTTPClientTransport(new URL(config.endpoint), {
  //     requestInit: config.auth_env_var
  //       ? { headers: { authorization: `Bearer ${process.env[config.auth_env_var]}` } }
  //       : undefined,
  //   })
  //   await client.connect(transport)
  //   ... subscribe to events; on event → ingestObservation()
  //
  // Until then, mark the source as configuring with a clear hint.
  void config
  handle.error =
    'MCP transport is not yet wired in this build — add @modelcontextprotocol/sdk and replace the stub in src/orchestrator/mcpClient.ts'
  handle.connected = false
  markStatus(source.id, 'configuring', handle.error)
  log.detail(
    'mcp',
    `${source.name}: stub — MCP SDK not yet integrated (Phase 21 fake_pulse + polled_url are the live paths)`,
  )
}

function teardown(handle: ClientHandle): void {
  if (handle.retryTimer) clearTimeout(handle.retryTimer)
  handle.connected = false
  handle.client = null
}

function markStatus(
  sourceId: string,
  status: Source['status'],
  error?: string,
): void {
  if (!depsRef) return
  const list = listSources(depsRef.db)
  const source = list.find((s) => s.id === sourceId)
  if (!source) return
  const next: Source = {
    ...source,
    status,
    last_error: error,
    updated_at: new Date().toISOString(),
  }
  updateSource(depsRef.db, next)
}

export function shutdownMcpClients(): void {
  for (const handle of clients.values()) teardown(handle)
  clients.clear()
}
