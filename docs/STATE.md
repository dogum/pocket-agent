# Pocket Agent — State

> **Read this first when returning to the repo.** This is the working
> journal — where the project is, what's in flight, what's deferred,
> where it's heading. The [README](../README.md) is the public intro;
> the [CHANGELOG](../CHANGELOG.md) is the shipped-history log;
> this file is the live picture of "now."

---

## Current state

**Latest release:** [v0.1.0](../CHANGELOG.md#010----2026-05-10) — the substrate is shipped.

**In flight:** Phase 21 — Sources, Reflexes, and Living Artifacts. The substrate so far has been a great *reactive* turn-taker; Phase 21 makes it *ambient*. The agent gets an observation surface (external feeds → per-source ring buffers), a way to author its own watchers (reflexes the user approves), and artifacts that can update themselves in place when subscribed observations arrive. See the phase plan in PR notes for the design.

**What `main` looks like today:** scaffold + 20 phases of substrate + Observatory design system + 23 artifact components + cron triggers + session continuity + universal reply + session lifecycle + OSS scaffolding (LICENSE, CI matrix, CodeQL, Dependabot). Onboarding plays a 5-step cinematic. The agent has memory across turns within a local session.

---

## Architecture, in 90 seconds

Pocket Agent is two halves that talk over the Anthropic Managed Agents SDK.

```
pocket-agent/
├── shared/        TypeScript types used by BOTH server and web
├── src/           Hono API server on Node 20+
└── web/           React 18 + Vite SPA on the browser
```

**The agent contract** is the `Artifact` shape in [`shared/artifact.ts`](../shared/artifact.ts) — a discriminated union of component types. The agent's system prompt in [`src/agent-prompt.ts`](../src/agent-prompt.ts) tells the agent how to compose them. The renderer in [`web/src/components/artifact/ArtifactRenderer.tsx`](../web/src/components/artifact/ArtifactRenderer.tsx) renders them. **All three move together — see [CONTRIBUTING.md](../CONTRIBUTING.md) for the lockstep.**

**Orchestration** lives in [`src/orchestrator/streamSession.ts`](../src/orchestrator/streamSession.ts). Two non-negotiable patterns:

1. **Stream-first ordering** — open the SSE event stream BEFORE sending the kickoff `user.message`. Reverse this and you lose real-time reactivity.
2. **Idle-break gate** — only break on `session.status_terminated` or `session.status_idle` with a non-`requires_action` `stop_reason`. Bare `idle` fires transiently.

**Session continuity** (Phase 15): one local session reuses one managed Anthropic session across many ingests. `streamSession` pre-flights `sessions.retrieve()` and falls back to fresh on 404 or any non-resumable status. This is why the agent has memory across turns within a local session.

**Trigger scheduler** (Phase 12): [`src/lib/scheduler.ts`](../src/lib/scheduler.ts) uses `node-cron` to register per-session cron triggers at boot and on every CRUD mutation. Trigger firings drain `streamSession()` server-side and persist the artifact.

**Storage** is [`better-sqlite3`](../src/db.ts) with FTS5 for search. Migrations are transactional via `advance(target, fn)` — the schema version only bumps after the migration runs cleanly.

**Settings** live in `localStorage` under `pocket-agent:settings` (theme/accent/density/atmosphere/grain/notifications). The Profile screen wires every toggle to the persisted store.

**Confirm dialogs** are native via [`web/src/store/useConfirm.ts`](../web/src/store/useConfirm.ts) + [`ConfirmDialog.tsx`](../web/src/components/shell/ConfirmDialog.tsx). No `window.confirm()` anywhere.

---

## Phases shipped

| Phase | What |
|------:|------|
| 0  | Scaffold (package.json, tsconfig, vite, tailwind, env) |
| 1  | Shared types (Artifact schema, Session, SSE events) |
| 2  | Server skeleton (Hono + SQLite + Anthropic client + bootstrap-agent) |
| 3  | Observatory CSS theme + shell + 19 component renderers |
| 4  | Screens wired to local API |
| 5  | File upload pipeline (multipart + Anthropic Files API + local byte cache) |
| 6  | Agent loop (run endpoint, streamSession, parseArtifact, useLiveStream) |
| 7  | Onboarding polish + actions + search (FTS5) + briefings table |
| 8  | OSS-readiness: README v1 |
| 9  | Settings persistence + Profile rebuild + light/dark/auto theme |
| 10 | Browser push notifications |
| 11 | Privacy & data screen + export + clear-all |
| 12 | Agent triggers (cron scheduler + execution + UI) |
| 13 | Onboarding cinematic (5-step prototype) |
| 14 | Component Library + Agent States as user-facing reference screens |
| 15 | **Session continuity** — one managed session per local session |
| 16 | Hardening (double-click lock, run queue + banner, ConfirmDialog) |
| 17 | Universal Reply on every artifact |
| 18 | Session lifecycle (archive / complete / delete) + archived viewer |
| 19 | Polish (profile name in prompts, image inline in timeline, triggers shortcut on session detail) |
| 20 | **4 new component types** — `question_set`, `markdown`, `key_value_list`, `link_preview` |
| OSS bootstrap | LICENSE, README, CONTRIBUTING, SECURITY, CHANGELOG, .github/ templates, CI matrix, Dependabot, CodeQL, social preview, app screenshot |
| **21 (in flight)** | **Sources, Reflexes, Living Artifacts** — observation surface + agent-authored watchers + in-place artifact updates |

---

## What's deferred (not yet built)

These are explicitly *out of scope* for the current release but live in the backlog:

- **Voice ingest** — the button is disabled with "Coming soon"
- **Per-session memory store integration** — pattern is in `_pocket-agent-reference/`, not yet wired
- **Multi-user / auth / hosted demo** — local-first by design today; the architecture is clean enough to graduate
- **Capacitor wrap for iOS/Android** — same
- **Live artifact-draft preview during streaming** — today the scan-bar shows the tool/text, but no draft card materializes
- **Briefing auto-generation** — the table + endpoint exist; nothing populates it
- **Search narrowing** — chips for type / session / date range (the prototype had these)
- **Voice / image as agent OUTPUT** (vs. only input) — agent can render images but doesn't generate them

---

## Suggested next moves

Beyond Phase 21, the natural candidates are:

1. **Live draft preview during streaming** — when `artifact.ready` is queued and the agent is mid-stream, show a "draft" placeholder card in the feed with the live text. Closes the visible gap between "scan-bar working" and "card appears."
2. **Briefing auto-generation** — when the feed is empty or stale (>24h since latest), trigger the agent to compose a single `Briefing` artifact (greeting + summary of recent context). Populates the slot at the top of the feed.
3. **Search narrowing** — chips for type/session/date on the Search screen.
4. **Voice ingest** — Whisper local or via Anthropic's audio path when it's beta. Closes the only obviously disabled affordance.
5. **MCP per-session UI on top of Phase 21 Sources** — Phase 21 introduces the Source primitive; this would expose per-session MCP attachments through it.
6. **Per-session memory store integration** — mirror the reference pattern; gives the agent durable cross-managed-session memory.

For each: branch off `main`, PR back, CI gates it. CI runs Node 20/22/24 + CodeQL. Dependabot watches the dep wall weekly.

---

## Returning to the repo

```bash
# from the repo root
cat docs/STATE.md             # this file
git log --oneline -10         # recent activity
gh pr list                    # open PRs (Dependabot etc.)
pnpm install                  # if first time
pnpm bootstrap-agent          # provision the Anthropic agent if not yet
pnpm dev                      # API on :8787 + web on :5173
```

The Anthropic resources persist across API-key rotations and across restarts — `bootstrap-agent` is idempotent. To start completely fresh, clear `AGENT_ID` and `ENVIRONMENT_ID` from `.env` and re-run it.

To re-sync the agent's system prompt after editing [`src/agent-prompt.ts`](../src/agent-prompt.ts):

```bash
pnpm bootstrap-agent          # detects prompt-hash drift and pushes the new prompt
```

To clear local user data for a fresh demo (preserves the agent itself):
**Profile → Privacy & data → Clear all data** (type `delete`).
