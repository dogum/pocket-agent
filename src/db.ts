// =====================================================================
// SQLite (better-sqlite3) — the local database.
//
// Schema mirrors the substrate's Supabase schema, adapted for SQLite:
//   • UUIDs → TEXT primary keys (we generate via lib/id.ts)
//   • JSONB → TEXT (JSON serialized at the application boundary)
//   • RLS policies → none (single local user)
//   • Realtime publication → handled by SSE in /api/run
//
// Migrations are linear and idempotent: each run advances `meta.schema_version`
// up to the latest. Only forward migrations — to roll back, restore a
// gitignored backup of `data/app.db` (we never auto-delete user data).
// =====================================================================

import Database, { type Database as DB } from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

import type {
  Artifact,
  ArtifactComponent,
  ArtifactAction,
  ArtifactSubscription,
  ArtifactVersion,
  Session,
  SessionConfig,
  Ingest,
  IngestMetadata,
  Briefing,
  Source,
  SourceConfig,
  SourceKind,
  SourceStatus,
  Observation,
  Reflex,
  ReflexMatch,
} from '../shared/index.js'
import { DEFAULT_RING_BUFFER_SIZE } from '../shared/index.js'

let db: DB | null = null

export function getDb(dbPath: string): DB {
  if (db) return db

  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  migrate(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ─── Migrations ──────────────────────────────────────────────────────

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  const versionRow = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined
  let current = versionRow ? Number(versionRow.value) : 0

  // Wrap each migration step in a transaction so a partial run doesn't
  // poison `meta.schema_version` and skip the rest forever.
  const advance = (target: number, fn: (db: DB) => void): void => {
    if (current >= target) return
    const tx = db.transaction(() => {
      fn(db)
      db.prepare(
        'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      ).run('schema_version', String(target))
    })
    tx()
    current = target
  }

  advance(1, migration_001)
  advance(2, migration_002)
  advance(3, migration_003)
  advance(4, migration_004)
}

function migration_001(db: DB): void {
  db.exec(`
    -- Singleton row for the bootstrapped agent + environment IDs and
    -- the prompt hash we last synced to the agent. Row id is fixed at 1.
    CREATE TABLE IF NOT EXISTS agent_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      agent_id TEXT NOT NULL,
      environment_id TEXT NOT NULL,
      agent_version INTEGER NOT NULL,
      prompt_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Long-running threads the agent works on autonomously.
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'idle', 'complete')),
      run_status TEXT
        CHECK (run_status IS NULL OR run_status IN
          ('streaming', 'idle', 'requires_action', 'terminated', 'error')),
      managed_session_id TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      ingest_count INTEGER NOT NULL DEFAULT 0,
      artifact_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_status
      ON sessions(status, updated_at DESC);

    -- Every input the user has ever sent.
    CREATE TABLE IF NOT EXISTS ingests (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      type TEXT NOT NULL
        CHECK (type IN ('photo', 'voice', 'file', 'link', 'text', 'share')),
      file_url TEXT,
      raw_text TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'routed', 'processing', 'processed', 'failed')),
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ingests_session
      ON ingests(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ingests_pending
      ON ingests(status) WHERE status = 'pending';

    -- Agent-produced structured outputs. components and actions are JSON.
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('high', 'normal', 'low')),
      notify INTEGER NOT NULL DEFAULT 0,
      header TEXT NOT NULL,
      components TEXT NOT NULL DEFAULT '[]',
      actions TEXT NOT NULL DEFAULT '[]',
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_feed
      ON artifacts(created_at DESC) WHERE archived = 0;
    CREATE INDEX IF NOT EXISTS idx_artifacts_session
      ON artifacts(session_id, created_at DESC);

    -- Personalized greeting at the top of the feed. One latest per session.
    CREATE TABLE IF NOT EXISTS briefings (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      greeting_html TEXT NOT NULL,
      summary TEXT NOT NULL,
      active_session_name TEXT,
      active_session_status TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_briefings_session
      ON briefings(session_id, created_at DESC);

    -- Tracked Anthropic Files API uploads (so we can preview without
    -- re-downloading; the Files API refuses to re-download user uploads).
    CREATE TABLE IF NOT EXISTS file_uploads (
      file_id TEXT PRIMARY KEY,
      ingest_id TEXT REFERENCES ingests(id) ON DELETE SET NULL,
      filename TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      cache_path TEXT,
      uploaded_at TEXT NOT NULL
    );

    -- Full-text search over artifact text. Populated by triggers below.
    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
      artifact_id UNINDEXED,
      title,
      summary,
      body,
      tokenize = 'porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS artifacts_fts_insert
      AFTER INSERT ON artifacts BEGIN
      INSERT INTO artifacts_fts (artifact_id, title, summary, body)
      VALUES (
        NEW.id,
        json_extract(NEW.header, '$.title'),
        COALESCE(json_extract(NEW.header, '$.summary'), ''),
        NEW.components
      );
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_fts_delete
      AFTER DELETE ON artifacts BEGIN
      DELETE FROM artifacts_fts WHERE artifact_id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_fts_update
      AFTER UPDATE OF header, components ON artifacts BEGIN
      DELETE FROM artifacts_fts WHERE artifact_id = OLD.id;
      INSERT INTO artifacts_fts (artifact_id, title, summary, body)
      VALUES (
        NEW.id,
        json_extract(NEW.header, '$.title'),
        COALESCE(json_extract(NEW.header, '$.summary'), ''),
        NEW.components
      );
    END;

    -- Auto-update sessions.updated_at on change.
    CREATE TRIGGER IF NOT EXISTS sessions_touch
      AFTER UPDATE ON sessions BEGIN
      UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = NEW.id AND OLD.updated_at = NEW.updated_at;
    END;

    -- Increment counters when ingest/artifact rows are inserted.
    CREATE TRIGGER IF NOT EXISTS ingests_count
      AFTER INSERT ON ingests
      WHEN NEW.session_id IS NOT NULL BEGIN
      UPDATE sessions SET ingest_count = ingest_count + 1
        WHERE id = NEW.session_id;
    END;

    CREATE TRIGGER IF NOT EXISTS artifacts_count
      AFTER INSERT ON artifacts BEGIN
      UPDATE sessions SET artifact_count = artifact_count + 1
        WHERE id = NEW.session_id;
    END;
  `)
}

function migration_003(db: DB): void {
  // Soft-delete column for sessions. Archive hides them from the main
  // list but keeps the data; trigger registry pauses on archive.
  db.exec(`
    ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_sessions_archived
      ON sessions(archived, updated_at DESC);
  `)
}

function migration_002(db: DB): void {
  db.exec(`
    -- Singleton profile row. Stores the user's display name so the agent
    -- system prompt and UI can address them by name.
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Seed an empty row so GET /api/profile is never null.
    INSERT OR IGNORE INTO profile (id, name, created_at, updated_at)
    VALUES (1, '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `)
}

function migration_004(db: DB): void {
  // Phase 21 — Sources, Observations, Reflexes, Living Artifacts.
  db.exec(`
    -- Long-lived external feeds the agent observes between user turns.
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL
        CHECK (kind IN ('mcp', 'webhook', 'polled_url', 'demo')),
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (status IN
          ('connected', 'disconnected', 'configuring', 'error', 'paused')),
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 0,
      last_observation_at TEXT,
      last_error TEXT,
      ring_buffer_size INTEGER NOT NULL DEFAULT 200,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Per-source ring buffer of observations. We trim on each insert
    -- to keep at most ring_buffer_size rows per source.
    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      observed_at TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_observations_source
      ON observations(source_id, observed_at DESC);

    -- Which sources are attached to which sessions. The kickoff
    -- assembler pulls recent observations from attached sources.
    CREATE TABLE IF NOT EXISTS session_sources (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      attached_at TEXT NOT NULL,
      PRIMARY KEY (session_id, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_session_sources_by_source
      ON session_sources(source_id);

    -- Agent-authored watchers. Start as reflex_proposal components in an
    -- artifact card; once approved by the user, they fire automatically
    -- when matching observations arrive (debounced).
    CREATE TABLE IF NOT EXISTS reflexes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      match TEXT NOT NULL,
      kickoff_prompt TEXT NOT NULL,
      artifact_hint TEXT,
      debounce_seconds INTEGER NOT NULL DEFAULT 300,
      last_fired_at TEXT,
      fire_count INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reflexes_session
      ON reflexes(session_id, updated_at DESC);

    -- Add the subscribes_to / version / last_updated_at fields onto
    -- artifacts. version starts at 0 (the initial); each in-place
    -- update increments it and writes the prior state into artifact_versions.
    ALTER TABLE artifacts ADD COLUMN subscribes_to TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE artifacts ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE artifacts ADD COLUMN last_updated_at TEXT;

    -- Snapshots of an artifact's prior state before each in-place update.
    -- Row 0 is the original; row N is the state captured just before the
    -- Nth update overwrote it.
    CREATE TABLE IF NOT EXISTS artifact_versions (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      header TEXT NOT NULL,
      components TEXT NOT NULL,
      triggering_observation_id TEXT,
      reason TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (artifact_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_artifact_versions
      ON artifact_versions(artifact_id, version DESC);
  `)
}

// ─── Row mappers ─────────────────────────────────────────────────────

interface SessionRow {
  id: string
  name: string
  description: string | null
  status: 'active' | 'idle' | 'complete'
  archived: number
  run_status: Session['run_status'] | null
  managed_session_id: string | null
  config: string
  ingest_count: number
  artifact_count: number
  created_at: string
  updated_at: string
}

export function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    archived: row.archived === 1,
    run_status: row.run_status ?? undefined,
    managed_session_id: row.managed_session_id ?? undefined,
    config: JSON.parse(row.config) as SessionConfig,
    ingest_count: row.ingest_count,
    artifact_count: row.artifact_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface ArtifactRow {
  id: string
  session_id: string
  priority: 'high' | 'normal' | 'low'
  notify: number
  header: string
  components: string
  actions: string
  archived: number
  subscribes_to: string | null
  version: number | null
  last_updated_at: string | null
  created_at: string
}

export function rowToArtifact(row: ArtifactRow): Artifact {
  const subs = row.subscribes_to
    ? (JSON.parse(row.subscribes_to) as ArtifactSubscription[])
    : []
  return {
    id: row.id,
    session_id: row.session_id,
    priority: row.priority,
    notify: row.notify === 1,
    header: JSON.parse(row.header) as Artifact['header'],
    components: JSON.parse(row.components) as ArtifactComponent[],
    actions: JSON.parse(row.actions) as ArtifactAction[],
    subscribes_to: subs.length > 0 ? subs : undefined,
    version: row.version ?? 0,
    last_updated_at: row.last_updated_at ?? undefined,
    created_at: row.created_at,
  }
}

interface IngestRow {
  id: string
  session_id: string | null
  type: Ingest['type']
  file_url: string | null
  raw_text: string | null
  metadata: string
  status: Ingest['status']
  error_message: string | null
  created_at: string
}

export function rowToIngest(row: IngestRow): Ingest {
  return {
    id: row.id,
    session_id: row.session_id,
    type: row.type,
    file_url: row.file_url ?? undefined,
    raw_text: row.raw_text ?? undefined,
    metadata: JSON.parse(row.metadata) as IngestMetadata,
    status: row.status,
    error_message: row.error_message ?? undefined,
    created_at: row.created_at,
  }
}

interface BriefingRow {
  id: string
  session_id: string
  greeting_html: string
  summary: string
  active_session_name: string | null
  active_session_status: string | null
  created_at: string
}

export function rowToBriefing(row: BriefingRow): Briefing {
  return {
    id: row.id,
    session_id: row.session_id,
    user_id: 'local',
    greeting_html: row.greeting_html,
    summary: row.summary,
    active_session: row.active_session_name
      ? {
          name: row.active_session_name,
          status_text: row.active_session_status ?? '',
        }
      : undefined,
    created_at: row.created_at,
  }
}

// ─── Profile ─────────────────────────────────────────────────────────

export interface ProfileRow {
  name: string
  created_at: string
  updated_at: string
}

export function getProfile(database: DB): ProfileRow {
  const row = database
    .prepare('SELECT name, created_at, updated_at FROM profile WHERE id = 1')
    .get() as ProfileRow | undefined
  if (row) return row
  const now = new Date().toISOString()
  database
    .prepare(
      'INSERT INTO profile (id, name, created_at, updated_at) VALUES (1, ?, ?, ?)',
    )
    .run('', now, now)
  return { name: '', created_at: now, updated_at: now }
}

export function setProfileName(database: DB, name: string): ProfileRow {
  const now = new Date().toISOString()
  database
    .prepare(`
      INSERT INTO profile (id, name, created_at, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `)
    .run(name, now, now)
  return getProfile(database)
}

/** Count distinct source strings across every `sources` component in
 *  every artifact. Used by Profile stats. */
export function countUniqueSources(database: DB): number {
  const rows = database
    .prepare("SELECT components FROM artifacts WHERE archived = 0")
    .all() as Array<{ components: string }>
  const set = new Set<string>()
  for (const row of rows) {
    try {
      const components = JSON.parse(row.components) as Array<{
        type: string
        items?: string[]
      }>
      for (const c of components) {
        if (c.type === 'sources' && Array.isArray(c.items)) {
          for (const item of c.items) {
            if (typeof item === 'string') set.add(item.toLowerCase())
          }
        }
      }
    } catch {
      // Skip malformed rows.
    }
  }
  return set.size
}

// ─── Agent state ─────────────────────────────────────────────────────

export interface AgentState {
  agent_id: string
  environment_id: string
  agent_version: number
  prompt_hash: string
}

export function getAgentState(database: DB): AgentState | null {
  const row = database
    .prepare('SELECT * FROM agent_state WHERE id = 1')
    .get() as
    | (AgentState & { id: number; created_at: string; updated_at: string })
    | undefined
  if (!row) return null
  return {
    agent_id: row.agent_id,
    environment_id: row.environment_id,
    agent_version: row.agent_version,
    prompt_hash: row.prompt_hash,
  }
}

export function setAgentState(database: DB, state: AgentState): void {
  const now = new Date().toISOString()
  database
    .prepare(`
      INSERT INTO agent_state (id, agent_id, environment_id, agent_version, prompt_hash, created_at, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent_id = excluded.agent_id,
        environment_id = excluded.environment_id,
        agent_version = excluded.agent_version,
        prompt_hash = excluded.prompt_hash,
        updated_at = excluded.updated_at
    `)
    .run(
      state.agent_id,
      state.environment_id,
      state.agent_version,
      state.prompt_hash,
      now,
      now,
    )
}

// ─── Sources / Observations / Reflexes ───────────────────────────────

interface SourceRow {
  id: string
  kind: SourceKind
  name: string
  label: string
  description: string | null
  status: SourceStatus
  config: string
  enabled: number
  last_observation_at: string | null
  last_error: string | null
  ring_buffer_size: number
  created_at: string
  updated_at: string
}

export function rowToSource(row: SourceRow): Source {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    label: row.label,
    description: row.description ?? undefined,
    status: row.status,
    config: JSON.parse(row.config) as SourceConfig,
    enabled: row.enabled === 1,
    last_observation_at: row.last_observation_at ?? undefined,
    last_error: row.last_error ?? undefined,
    ring_buffer_size: row.ring_buffer_size,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function listSources(database: DB): Source[] {
  const rows = database
    .prepare(`SELECT * FROM sources ORDER BY created_at ASC`)
    .all() as SourceRow[]
  return rows.map(rowToSource)
}

export function getSource(database: DB, id: string): Source | null {
  const row = database
    .prepare(`SELECT * FROM sources WHERE id = ?`)
    .get(id) as SourceRow | undefined
  return row ? rowToSource(row) : null
}

export function getSourceByName(
  database: DB,
  name: string,
): Source | null {
  const row = database
    .prepare(`SELECT * FROM sources WHERE name = ?`)
    .get(name) as SourceRow | undefined
  return row ? rowToSource(row) : null
}

export function insertSource(database: DB, source: Source): void {
  database
    .prepare(`
      INSERT INTO sources (
        id, kind, name, label, description, status, config, enabled,
        last_observation_at, last_error, ring_buffer_size,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      source.id,
      source.kind,
      source.name,
      source.label,
      source.description ?? null,
      source.status,
      JSON.stringify(source.config),
      source.enabled ? 1 : 0,
      source.last_observation_at ?? null,
      source.last_error ?? null,
      source.ring_buffer_size,
      source.created_at,
      source.updated_at,
    )
}

export function updateSource(database: DB, source: Source): void {
  database
    .prepare(`
      UPDATE sources SET
        kind = ?, name = ?, label = ?, description = ?, status = ?,
        config = ?, enabled = ?, last_observation_at = ?, last_error = ?,
        ring_buffer_size = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      source.kind,
      source.name,
      source.label,
      source.description ?? null,
      source.status,
      JSON.stringify(source.config),
      source.enabled ? 1 : 0,
      source.last_observation_at ?? null,
      source.last_error ?? null,
      source.ring_buffer_size,
      source.updated_at,
      source.id,
    )
}

export function deleteSource(database: DB, id: string): void {
  database.prepare(`DELETE FROM sources WHERE id = ?`).run(id)
}

/** Targeted update of a source's runtime status only — does NOT touch
 *  config/enabled/label/description/ring_buffer_size. Use this from
 *  background tasks (polling, MCP reconnects, fake_pulse) so a user
 *  edit that races with an in-flight write doesn't get clobbered by
 *  the task's stale snapshot of the row. */
export function setSourceRuntimeStatus(
  database: DB,
  sourceId: string,
  patch: {
    status?: SourceStatus
    last_error?: string | null
    last_observation_at?: string | null
  },
): void {
  const sets: string[] = []
  const params: (string | null)[] = []
  if (patch.status !== undefined) {
    sets.push('status = ?')
    params.push(patch.status)
  }
  if (patch.last_error !== undefined) {
    sets.push('last_error = ?')
    params.push(patch.last_error)
  }
  if (patch.last_observation_at !== undefined) {
    sets.push('last_observation_at = ?')
    params.push(patch.last_observation_at)
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  params.push(new Date().toISOString())
  params.push(sourceId)
  database
    .prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`)
    .run(...params)
}

interface ObservationRow {
  id: string
  source_id: string
  observed_at: string
  payload: string
  summary: string
  created_at: string
}

function rowToObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    source_id: row.source_id,
    observed_at: row.observed_at,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    summary: row.summary,
  }
}

/** Insert an observation and trim the source's ring buffer to its cap.
 *  Returns the inserted observation. */
export function recordObservation(
  database: DB,
  obs: Observation,
): Observation {
  const insert = database.prepare(`
    INSERT INTO observations
      (id, source_id, observed_at, payload, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const cap = database
    .prepare(`SELECT ring_buffer_size FROM sources WHERE id = ?`)
    .get(obs.source_id) as { ring_buffer_size?: number } | undefined
  const limit = cap?.ring_buffer_size ?? DEFAULT_RING_BUFFER_SIZE

  const tx = database.transaction(() => {
    insert.run(
      obs.id,
      obs.source_id,
      obs.observed_at,
      JSON.stringify(obs.payload),
      obs.summary,
      new Date().toISOString(),
    )
    // Ring-buffer trim — keep the N most recent rows.
    database
      .prepare(`
        DELETE FROM observations
        WHERE source_id = ?
          AND id NOT IN (
            SELECT id FROM observations
            WHERE source_id = ?
            ORDER BY observed_at DESC
            LIMIT ?
          )
      `)
      .run(obs.source_id, obs.source_id, limit)
    database
      .prepare(`
        UPDATE sources SET last_observation_at = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(obs.observed_at, new Date().toISOString(), obs.source_id)
  })
  tx()
  return obs
}

export function listObservations(
  database: DB,
  sourceId: string,
  limit = 50,
): Observation[] {
  const rows = database
    .prepare(`
      SELECT * FROM observations
      WHERE source_id = ?
      ORDER BY observed_at DESC
      LIMIT ?
    `)
    .all(sourceId, limit) as ObservationRow[]
  return rows.map(rowToObservation)
}

export function getObservation(
  database: DB,
  id: string,
): Observation | null {
  const row = database
    .prepare(`SELECT * FROM observations WHERE id = ?`)
    .get(id) as ObservationRow | undefined
  return row ? rowToObservation(row) : null
}

/** Recent observations from sources attached to a session. Used to
 *  build the <recent_observations> block for the kickoff. */
export function recentObservationsForSession(
  database: DB,
  sessionId: string,
  perSourceLimit = 5,
): Array<{ source: Source; observations: Observation[] }> {
  const sourceRows = database
    .prepare(`
      SELECT s.* FROM session_sources ss
      JOIN sources s ON s.id = ss.source_id
      WHERE ss.session_id = ? AND s.enabled = 1
      ORDER BY ss.attached_at ASC
    `)
    .all(sessionId) as SourceRow[]
  return sourceRows.map((sr) => {
    const source = rowToSource(sr)
    const observations = listObservations(
      database,
      source.id,
      perSourceLimit,
    )
    return { source, observations }
  })
}

// ─── Session ↔ Source attachment ─────────────────────────────────────

export function attachSource(
  database: DB,
  sessionId: string,
  sourceId: string,
): void {
  database
    .prepare(`
      INSERT OR IGNORE INTO session_sources
        (session_id, source_id, attached_at)
      VALUES (?, ?, ?)
    `)
    .run(sessionId, sourceId, new Date().toISOString())
}

export function detachSource(
  database: DB,
  sessionId: string,
  sourceId: string,
): void {
  database
    .prepare(`
      DELETE FROM session_sources
      WHERE session_id = ? AND source_id = ?
    `)
    .run(sessionId, sourceId)
}

export function sessionsAttachedToSource(
  database: DB,
  sourceId: string,
): string[] {
  const rows = database
    .prepare(`SELECT session_id FROM session_sources WHERE source_id = ?`)
    .all(sourceId) as Array<{ session_id: string }>
  return rows.map((r) => r.session_id)
}

export function sourcesForSession(
  database: DB,
  sessionId: string,
): Source[] {
  const rows = database
    .prepare(`
      SELECT s.* FROM session_sources ss
      JOIN sources s ON s.id = ss.source_id
      WHERE ss.session_id = ?
      ORDER BY ss.attached_at ASC
    `)
    .all(sessionId) as SourceRow[]
  return rows.map(rowToSource)
}

// ─── Reflexes ────────────────────────────────────────────────────────

interface ReflexRow {
  id: string
  session_id: string
  description: string
  match: string
  kickoff_prompt: string
  artifact_hint: string | null
  debounce_seconds: number
  last_fired_at: string | null
  fire_count: number
  approved: number
  enabled: number
  created_at: string
  updated_at: string
}

function rowToReflex(row: ReflexRow): Reflex {
  return {
    id: row.id,
    session_id: row.session_id,
    description: row.description,
    match: JSON.parse(row.match) as ReflexMatch,
    kickoff_prompt: row.kickoff_prompt,
    artifact_hint: row.artifact_hint ?? undefined,
    debounce_seconds: row.debounce_seconds,
    last_fired_at: row.last_fired_at ?? undefined,
    fire_count: row.fire_count,
    approved: row.approved === 1,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function insertReflex(database: DB, reflex: Reflex): void {
  database
    .prepare(`
      INSERT INTO reflexes (
        id, session_id, description, match, kickoff_prompt, artifact_hint,
        debounce_seconds, last_fired_at, fire_count, approved, enabled,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      reflex.id,
      reflex.session_id,
      reflex.description,
      JSON.stringify(reflex.match),
      reflex.kickoff_prompt,
      reflex.artifact_hint ?? null,
      reflex.debounce_seconds,
      reflex.last_fired_at ?? null,
      reflex.fire_count,
      reflex.approved ? 1 : 0,
      reflex.enabled ? 1 : 0,
      reflex.created_at,
      reflex.updated_at,
    )
}

export function updateReflex(database: DB, reflex: Reflex): void {
  database
    .prepare(`
      UPDATE reflexes SET
        description = ?, match = ?, kickoff_prompt = ?, artifact_hint = ?,
        debounce_seconds = ?, last_fired_at = ?, fire_count = ?,
        approved = ?, enabled = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      reflex.description,
      JSON.stringify(reflex.match),
      reflex.kickoff_prompt,
      reflex.artifact_hint ?? null,
      reflex.debounce_seconds,
      reflex.last_fired_at ?? null,
      reflex.fire_count,
      reflex.approved ? 1 : 0,
      reflex.enabled ? 1 : 0,
      reflex.updated_at,
      reflex.id,
    )
}

export function deleteReflex(database: DB, id: string): void {
  database.prepare(`DELETE FROM reflexes WHERE id = ?`).run(id)
}

/** Targeted: stamp `last_fired_at` at the moment we decide to fire,
 *  so subsequent observations within debounce_seconds skip. Doesn't
 *  touch description/match/kickoff/approved/enabled — those are owned
 *  by the user via PATCH and must not be reverted by a fire-path
 *  writeback that's racing with a user edit. */
export function reserveReflexFire(database: DB, id: string): void {
  const now = new Date().toISOString()
  database
    .prepare(
      `UPDATE reflexes SET last_fired_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(now, now, id)
}

/** Targeted: atomically increment fire_count after a successful run.
 *  Same rationale as reserveReflexFire — never write the whole row. */
export function completeReflexFire(database: DB, id: string): void {
  database
    .prepare(
      `UPDATE reflexes
       SET fire_count = fire_count + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(new Date().toISOString(), id)
}

export function getReflex(database: DB, id: string): Reflex | null {
  const row = database
    .prepare(`SELECT * FROM reflexes WHERE id = ?`)
    .get(id) as ReflexRow | undefined
  return row ? rowToReflex(row) : null
}

export function listReflexesForSession(
  database: DB,
  sessionId: string,
): Reflex[] {
  const rows = database
    .prepare(`
      SELECT * FROM reflexes WHERE session_id = ?
      ORDER BY created_at DESC
    `)
    .all(sessionId) as ReflexRow[]
  return rows.map(rowToReflex)
}

/** Approved + enabled reflexes that watch the given source. The reflex
 *  evaluator iterates these on each new observation. */
export function activeReflexesForSource(
  database: DB,
  sourceId: string,
): Reflex[] {
  const rows = database
    .prepare(`
      SELECT * FROM reflexes
      WHERE approved = 1 AND enabled = 1
        AND json_extract(match, '$.source_id') = ?
      ORDER BY created_at ASC
    `)
    .all(sourceId) as ReflexRow[]
  return rows.map(rowToReflex)
}

// ─── Artifact subscriptions + version history ────────────────────────

/** Artifacts that subscribe to the given source. Each row may have a
 *  filter we evaluate per-observation before re-running the agent. */
export function artifactsSubscribedToSource(
  database: DB,
  sourceId: string,
): Artifact[] {
  // SQLite doesn't have JSON-each helpers we can rely on for nested
  // membership across versions, so we scan and filter in JS.
  const rows = database
    .prepare(`
      SELECT * FROM artifacts
      WHERE archived = 0 AND subscribes_to LIKE '%' || ? || '%'
    `)
    .all(sourceId) as ArtifactRow[]
  const out: Artifact[] = []
  for (const r of rows) {
    const a = rowToArtifact(r)
    if (a.subscribes_to?.some((s) => s.source_id === sourceId)) out.push(a)
  }
  return out
}

export function setArtifactSubscriptions(
  database: DB,
  artifactId: string,
  subs: ArtifactSubscription[],
): void {
  database
    .prepare(`UPDATE artifacts SET subscribes_to = ? WHERE id = ?`)
    .run(JSON.stringify(subs), artifactId)
}

/** Replace the artifact's body in place and append a version row for
 *  the new state. Returns the new version number.
 *
 *  History invariant: the prior state's row is ALREADY in
 *  `artifact_versions` — either v=0 seeded by `persistArtifact`, or
 *  v=N seeded by an earlier `updateArtifactInPlace` call. So this
 *  function only writes ONE row: the new (current) state at
 *  `nextVersion`. Don't re-snapshot the prior state here — that would
 *  collide with the row already at `(artifact_id, current.version)`. */
export function updateArtifactInPlace(
  database: DB,
  artifactId: string,
  next: {
    header: Artifact['header']
    components: ArtifactComponent[]
    actions?: ArtifactAction[]
    subscribes_to?: ArtifactSubscription[]
    triggering_observation_id?: string
    reason?: string
  },
): { artifact: Artifact; version: number } | null {
  const current = database
    .prepare(`SELECT * FROM artifacts WHERE id = ?`)
    .get(artifactId) as ArtifactRow | undefined
  if (!current) return null
  const now = new Date().toISOString()
  const nextVersion = (current.version ?? 0) + 1

  const tx = database.transaction(() => {
    // Write the new body.
    database
      .prepare(`
        UPDATE artifacts SET
          header = ?, components = ?, actions = ?,
          subscribes_to = ?, version = ?, last_updated_at = ?
        WHERE id = ?
      `)
      .run(
        JSON.stringify(next.header),
        JSON.stringify(next.components),
        JSON.stringify(next.actions ?? []),
        JSON.stringify(
          next.subscribes_to ??
            (current.subscribes_to ? JSON.parse(current.subscribes_to) : []),
        ),
        nextVersion,
        now,
        artifactId,
      )

    // Append the new state to the version history, tagged with the
    // triggering observation + reason so the history sheet can describe
    // each transition.
    database
      .prepare(`
        INSERT INTO artifact_versions (
          id, artifact_id, version, header, components,
          triggering_observation_id, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        `av_${nextVersion}_${artifactId}`,
        artifactId,
        nextVersion,
        JSON.stringify(next.header),
        JSON.stringify(next.components),
        next.triggering_observation_id ?? null,
        next.reason ?? null,
        now,
      )
  })
  tx()

  const updated = database
    .prepare(`SELECT * FROM artifacts WHERE id = ?`)
    .get(artifactId) as ArtifactRow
  return { artifact: rowToArtifact(updated), version: nextVersion }
}

interface ArtifactVersionRow {
  id: string
  artifact_id: string
  version: number
  header: string
  components: string
  triggering_observation_id: string | null
  reason: string | null
  created_at: string
}

export function listArtifactVersions(
  database: DB,
  artifactId: string,
): ArtifactVersion[] {
  const rows = database
    .prepare(`
      SELECT * FROM artifact_versions
      WHERE artifact_id = ?
      ORDER BY version DESC, created_at DESC
    `)
    .all(artifactId) as ArtifactVersionRow[]
  return rows.map((r) => ({
    id: r.id,
    artifact_id: r.artifact_id,
    version: r.version,
    header: JSON.parse(r.header) as Artifact['header'],
    components: JSON.parse(r.components) as ArtifactComponent[],
    triggering_observation_id: r.triggering_observation_id ?? undefined,
    reason: r.reason ?? undefined,
    created_at: r.created_at,
  }))
}
