// =====================================================================
// Anthropic SDK client + env-loading.
//
// The Managed Agents beta header (`managed-agents-2026-04-01`) is set
// automatically by the SDK for every `client.beta.{agents,environments,
// sessions,vaults,memoryStores}.*` call. We only need to pass it
// explicitly when calling Files API endpoints under this beta — see
// the orchestrator for that detail.
//
// dotenv footgun preserved from the simulation-agent reference: an empty
// shell-exported value (e.g. a stale `export FOO=""` in a shell rc)
// causes dotenv to silently skip loading that key from .env. We treat
// empty/whitespace-only existing values as unset so .env wins.
// =====================================================================

import Anthropic from '@anthropic-ai/sdk'
import { config as dotenvConfig } from 'dotenv'

const result = dotenvConfig()
if (result.parsed) {
  for (const [key, value] of Object.entries(result.parsed)) {
    if (!process.env[key]?.trim()) {
      process.env[key] = value
    }
  }
}

export interface Config {
  apiKey: string
  agentId?: string
  environmentId?: string
  port: number
  dbPath: string
  uploadCacheDir: string
}

export class ConfigError extends Error {}

/** Read configuration from environment. Throws ConfigError if anything
 *  required is missing — caller decides whether to retry, prompt, or
 *  exit. AGENT_ID and ENVIRONMENT_ID are optional here because the
 *  bootstrap script needs to RUN without them set.  */
export function loadConfig(): Config {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new ConfigError(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.',
    )
  }

  const agentId = process.env.AGENT_ID?.trim() || undefined
  const environmentId = process.env.ENVIRONMENT_ID?.trim() || undefined
  const port = Number(process.env.PORT?.trim() || '8787')
  const dbPath = process.env.DB_PATH?.trim() || './data/app.db'
  const uploadCacheDir =
    process.env.UPLOAD_CACHE_DIR?.trim() || './data/uploads'

  return { apiKey, agentId, environmentId, port, dbPath, uploadCacheDir }
}

export function createClient(config: Config): Anthropic {
  return new Anthropic({ apiKey: config.apiKey })
}

/** Map an SDK error onto a tagged shape our HTTP layer can render. */
export type ApiErrorKind =
  | 'auth'
  | 'permission'
  | 'rate'
  | 'not_found'
  | 'api'
  | 'unknown'

export function classifyError(err: unknown): {
  kind: ApiErrorKind
  message: string
} {
  if (err instanceof Anthropic.AuthenticationError) {
    return { kind: 'auth', message: 'Authentication failed. Check ANTHROPIC_API_KEY.' }
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return {
      kind: 'permission',
      message: 'Permission denied. Your API key may not have Managed Agents beta access.',
    }
  }
  if (err instanceof Anthropic.NotFoundError) {
    return {
      kind: 'not_found',
      message: 'Resource not found. Check AGENT_ID / ENVIRONMENT_ID in .env.',
    }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { kind: 'rate', message: 'Rate limited. Wait a moment and retry.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { kind: 'api', message: `API error ${err.status}: ${err.message}` }
  }
  if (err instanceof Error) {
    return { kind: 'unknown', message: err.message }
  }
  return { kind: 'unknown', message: String(err) }
}
