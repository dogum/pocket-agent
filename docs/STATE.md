# Pocket Agent — State

> **Read this first when returning after a break.** This is the working
> journal — where we are, what just landed, what's loose, what comes
> next. The [README](../README.md) is the public-facing intro;
> [CHANGELOG](../CHANGELOG.md) is the shipped-history log;
> this file is the live picture of "now."

---

## Current state — 2026-05-11

**Repo:** [github.com/dogum/pocket-agent](https://github.com/dogum/pocket-agent) — **public**, MIT, default branch `main`.

**Latest release:** [v0.1.0](https://github.com/dogum/pocket-agent/releases/tag/v0.1.0) (2026-05-10).

**`main` head:** chore + docs commits past v0.1.0. The next user-visible feature should be the first **v0.2.0** candidate.

**Local working directory:** `/Users/gregdogum/Developer/pocket-agent/`. Reference material we worked from earlier (the original substrate package, the design prototypes, the simulation-agent example, the Anthropic docs) is parked at `/Users/gregdogum/Developer/_pocket-agent-reference/` — not in the repo, not deleted.

**Anthropic resources (in the user's org):**

| | |
|---|---|
| Agent | `agent_01L6ZnCxAZcsSzwXBTqf4MfL` — currently at **v2** of the prompt |
| Environment | `env_01Fxq9XTXH8zNAh6JGMomSTT` |
| Model | `claude-opus-4-7` |
| Tools | `agent_toolset_20260401` (full prebuilt set) |
| Prompt hash | `bf00605964e1528e` (the v2 prompt with `question_set` guidance) |

The agent still has its old name `the-agent-app` in the Anthropic console. Cosmetic only — `AGENT_NAME` in `src/agent-prompt.ts` is now `pocket-agent` and any fresh `bootstrap-agent` would create new resources with the new name. We deliberately didn't rename the existing agent.

**Local DB state:** the user's `data/app.db` has two sessions — their original "Job search" session (5 artifacts) and the demo "Marathon · Spring 2026" session (1 artifact) we seeded for the README screenshot. Nothing destructive happened.

---

## Architecture, in 90 seconds

Pocket Agent is two halves that talk over the Anthropic Managed Agents SDK.

```
pocket-agent/
├── shared/        TypeScript types used by BOTH server and web
├── src/           Hono API server on Node 20+
└── web/           React 18 + Vite SPA on the browser
```

**The agent contract** is the `Artifact` shape in [`shared/artifact.ts`](../shared/artifact.ts) — 23 component types as a discriminated union. The agent's system prompt in [`src/agent-prompt.ts`](../src/agent-prompt.ts) tells the agent how to compose them. The renderer in [`web/src/components/artifact/ArtifactRenderer.tsx`](../web/src/components/artifact/ArtifactRenderer.tsx) renders them. **All three move together — see CONTRIBUTING for the 7-place lockstep.**

**The orchestration** lives in [`src/orchestrator/streamSession.ts`](../src/orchestrator/streamSession.ts). Two non-negotiable patterns:

1. **Stream-first ordering** — open the SSE stream BEFORE sending the kickoff `user.message`. Reverse this and you lose real-time reactivity.
2. **Idle-break gate** — only break on `session.status_terminated` or `session.status_idle` with a non-`requires_action` `stop_reason`. Bare `idle` fires transiently.

**Session continuity** (Phase 15): one local session reuses ONE managed Anthropic session across many ingests. `streamSession` pre-flights `sessions.retrieve()` and falls back to fresh on 404 or any non-resumable status. This is why the agent has memory across turns within a local session.

**Trigger scheduler** (Phase 12): `src/lib/scheduler.ts` uses `node-cron` to register per-session cron triggers at boot and on every CRUD mutation. Trigger firings drain `streamSession()` server-side and persist the artifact.

**Storage** is [`better-sqlite3`](../src/db.ts) with FTS5 for search. Migrations are transactional via `advance(target, fn)` — version only bumps after the migration runs cleanly.

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

---

## What's deferred (not yet built)

These are explicitly *out of scope* for v0.1.0 but live in the backlog:

- **Voice ingest** — the button is disabled with "Coming soon"
- **Per-session MCP servers** — `session.config.mcp_servers` is in the schema but no UI/wiring
- **Per-session memory store integration** — pattern documented in the simulation-agent reference
- **Multi-user / auth / hosted demo** — local-first by design today; the architecture is clean enough to graduate
- **Capacitor wrap for iOS/Android** — same
- **Live artifact-draft preview during streaming** — today the scan-bar shows the tool/text, but no draft card materializes
- **Briefing auto-generation** — the table + endpoint exist; nothing populates it
- **Search narrowing** — chips for type / session / date range (the prototype had these)
- **Voice / image as agent OUTPUT** (vs. only input) — agent can render images but doesn't generate them
- **Archived-artifact viewer** — sessions can be archived; individual artifacts can be archived (via the dismiss action) but there's no "show archived artifacts" affordance yet

---

## Known loose ends (small)

- The existing managed session for the user's "Job search" session was created against agent v1; future ingests on that session will reuse it (with v1 prompt) until it terminates server-side, at which point Phase 15 fallback creates fresh against v2. The new "Marathon · Spring 2026" session already uses v2.
- The localStorage settings key changed from `the-agent-app:settings` → `pocket-agent:settings` in the rename. The user's previous settings (if any) were lost; defaults are sensible.
- The Dependabot PRs `#4` (anthropic SDK group), `#5` (vite-plugin-react v5), `#6` (Tailwind v4), `#7` (dotenv v17), `#8` (React 19) are open and held — major-version bumps need explicit testing, not auto-merge.
- The social preview image is committed to `docs/` but GitHub's social-preview slot needs to be uploaded manually via repo settings (no API).

---

## Suggested next moves

The natural v0.2.0 candidate is probably one of:

1. **Live draft preview during streaming** — when an `artifact.ready` is queued and the agent is mid-stream, show a "draft" placeholder card in the feed with the live text. Closes the visible gap between "scan-bar working" and "card appears."
2. **Briefing auto-generation** — when the feed is empty or stale (>24h since latest), trigger the agent to compose a single `Briefing` artifact (greeting + summary of recent context). Populates the briefing slot at the top of the feed.
3. **Search narrowing** — chips for type/session/date on the Search screen.
4. **Voice ingest** — Whisper local or via the Anthropic audio path when it's beta. Closes the only obviously disabled affordance.
5. **MCP per-session UI** — let users wire MCP servers to specific sessions. Unlocks domain-specific tools (a research session gets web-search + arxiv; a contractor session gets a permit-lookup MCP).
6. **Per-session memory store integration** — mirror the simulation-agent's pattern; gives the agent durable cross-managed-session memory.

For each: branch off `main`, PR back, CI gates it. CI is on Node 20/22/24 + CodeQL. Dependabot is watching the dep wall weekly.

---

## How to return to this in a fresh session

```bash
cd /Users/gregdogum/Developer/pocket-agent
cat docs/STATE.md             # this file
git log --oneline -10         # recent activity
gh pr list                    # open Dependabot PRs
pnpm dev                      # API :8787 + web :5173

# To clear local user data for a fresh demo (preserves agent):
# Profile → Privacy & data → Clear all data (type "delete")
```

The agent has the v2 prompt loaded already. To re-sync after editing `src/agent-prompt.ts`: `pnpm bootstrap-agent`.
