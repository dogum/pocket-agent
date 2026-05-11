// =====================================================================
// Bootstrap Agent — one-time provisioning script.
//
// Run: `pnpm bootstrap-agent`
//
// What it does, in order:
//   1. Loads ANTHROPIC_API_KEY from .env.
//   2. If AGENT_ID and ENVIRONMENT_ID are NOT set, creates them in your
//      Anthropic org and prints the values to add to .env.
//   3. If they ARE set, fetches the agent and compares the system prompt
//      hash. If it drifted, updates the agent (bumping its version).
//   4. Persists the resolved IDs + prompt hash to data/app.db so the
//      runtime server has a single source of truth.
//
// This is idempotent: rerun it any time you edit src/agent-prompt.ts to
// push the new prompt to the same agent.
// =====================================================================

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  AGENT_MODEL,
  AGENT_NAME,
  PROMPT_HASH,
  SYSTEM_PROMPT,
} from './agent-prompt.js'
import {
  classifyError,
  createClient,
  loadConfig,
  type Config,
} from './client.js'
import { getDb, getAgentState, setAgentState } from './db.js'
import * as log from './lib/log.js'

async function main(): Promise<void> {
  log.header('pocket-agent · bootstrap', 'Provision or sync the managed agent')

  let config: Config
  try {
    config = loadConfig()
  } catch (err) {
    log.fail(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  log.detail('model', AGENT_MODEL)
  log.detail('prompt', `${SYSTEM_PROMPT.length} chars · hash ${PROMPT_HASH}`)
  console.log()

  const client = createClient(config)
  const db = getDb(config.dbPath)
  const cached = getAgentState(db)

  // Resolve IDs: env wins; fall back to last bootstrap; otherwise create.
  let agentId = config.agentId ?? cached?.agent_id
  let environmentId = config.environmentId ?? cached?.environment_id
  let agentVersion: number | undefined = cached?.agent_version

  // ── Provision environment (if none) ─────────────────────────────
  if (!environmentId) {
    log.status('Creating environment…')
    try {
      const env = await client.beta.environments.create({
        name: 'pocket-agent',
        config: {
          type: 'cloud',
          networking: { type: 'unrestricted' },
        },
      })
      environmentId = env.id
      log.ok(`environment ${environmentId}`)
    } catch (err) {
      const c = classifyError(err)
      log.fail(`environment create failed (${c.kind}): ${c.message}`)
      process.exit(1)
    }
  } else {
    log.detail('environment', environmentId)
  }

  // ── Provision or update agent ───────────────────────────────────
  if (!agentId) {
    log.status('Creating agent…')
    try {
      const agent = await client.beta.agents.create({
        name: AGENT_NAME,
        model: AGENT_MODEL,
        system: SYSTEM_PROMPT,
        tools: [{ type: 'agent_toolset_20260401' }],
      })
      agentId = agent.id
      agentVersion = agent.version
      log.ok(`agent ${agentId} · v${agentVersion}`)
    } catch (err) {
      const c = classifyError(err)
      log.fail(`agent create failed (${c.kind}): ${c.message}`)
      process.exit(1)
    }
  } else {
    log.status(`Fetching agent ${agentId}…`)
    try {
      const remote = await client.beta.agents.retrieve(agentId)
      agentVersion = remote.version
      const driftedFromCache = cached && cached.prompt_hash !== PROMPT_HASH
      const driftedFromRemote = remote.system !== SYSTEM_PROMPT
      log.detail(
        'remote',
        `v${agentVersion}` +
          (driftedFromRemote ? ' · prompt drift detected' : ' · prompt in sync'),
      )

      if (driftedFromRemote || driftedFromCache) {
        log.status('Updating agent system prompt…')
        const updated = await client.beta.agents.update(agentId, {
          version: agentVersion,
          system: SYSTEM_PROMPT,
        })
        agentVersion = updated.version
        log.ok(`agent ${agentId} updated · v${agentVersion}`)
      } else {
        log.ok('agent already in sync')
      }
    } catch (err) {
      const c = classifyError(err)
      log.fail(`agent retrieve/update failed (${c.kind}): ${c.message}`)
      process.exit(1)
    }
  }

  // ── Persist resolved state ──────────────────────────────────────
  setAgentState(db, {
    agent_id: agentId!,
    environment_id: environmentId!,
    agent_version: agentVersion ?? 1,
    prompt_hash: PROMPT_HASH,
  })

  console.log()
  log.ok('bootstrap complete')

  // ── Print .env hint if values are new ───────────────────────────
  if (!config.agentId || !config.environmentId) {
    console.log()
    log.info('Add these to your .env:')
    console.log()
    console.log(`    AGENT_ID=${agentId}`)
    console.log(`    ENVIRONMENT_ID=${environmentId}`)
    console.log()

    // Best-effort write-through: update existing placeholder lines in
    // place; only append when the key is absent entirely.
    try {
      const envPath = resolve(process.cwd(), '.env')
      const { readFileSync, existsSync } = await import('node:fs')
      if (existsSync(envPath)) {
        const updates: Array<{ key: string; value: string }> = [
          { key: 'AGENT_ID', value: agentId! },
          { key: 'ENVIRONMENT_ID', value: environmentId! },
        ]
        let next = readFileSync(envPath, 'utf-8')
        let changed = false
        for (const { key, value } of updates) {
          const re = new RegExp(`^${key}=.*$`, 'm')
          if (re.test(next)) {
            // Replace existing line (empty placeholder or stale value).
            const replaced = next.replace(re, `${key}=${value}`)
            if (replaced !== next) {
              next = replaced
              changed = true
            }
          } else {
            // Key absent — append.
            next = next.replace(/\n*$/, '') + `\n${key}=${value}\n`
            changed = true
          }
        }
        if (changed) {
          writeFileSync(envPath, next)
          log.ok('updated .env')
        }
      }
    } catch {
      // Non-fatal — user can copy/paste manually.
    }
  }
}

main().catch((err) => {
  log.fail(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
