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
  Session,
  SessionConfig,
  Ingest,
  IngestMetadata,
  Briefing,
} from '../shared/index.js'

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
  created_at: string
}

export function rowToArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    session_id: row.session_id,
    priority: row.priority,
    notify: row.notify === 1,
    header: JSON.parse(row.header) as Artifact['header'],
    components: JSON.parse(row.components) as ArtifactComponent[],
    actions: JSON.parse(row.actions) as ArtifactAction[],
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
