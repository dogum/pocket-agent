# Pocket Agent — State

> **Read this first when returning to the repo.** This is the working
> journal — where the project is, what's in flight, what's deferred,
> where it's heading. The [README](../README.md) is the public intro;
> the [CHANGELOG](../CHANGELOG.md) is the shipped-history log;
> this file is the live picture of "now."

---

## Current state

**Latest release:** [v0.1.0](../CHANGELOG.md#010----2026-05-10) — the substrate is shipped.

**On `main` past v0.1.0:**

- **Phase 21 — Sources, Reflexes, Living Artifacts.** The substrate evolved from a *reactive* turn-taker into an *ambient* agent. Sources (polled URLs, MCP, webhooks-as-schema, plus a built-in `fake_pulse` demo) emit Observations into per-source ring buffers; attached sources feed the agent's kickoff via `<recent_observations>`. The agent can propose **Reflexes** the user approves inline — once approved they fire automatically on matching observations, debounced and event-driven. Artifacts can declare `subscribes_to` to become **living** — they re-render in place when matching observations arrive, with a `LIVE` badge and version history. A per-session run queue (user > trigger > reflex > artifact-update) keeps all four entry points cooperating on the same managed session.
- **Phase 22 — Vocabulary v2.** 30 new artifact component types across nine families: thinking (calculation, assumption_list, confidence_band, what_if), negotiation (counter_proposal, tradeoff_slider, draft_review), decision support (decision_matrix, pros_cons, ranking), orchestration (plan_card, checkpoint, decision_tree), time + cadence (schedule_picker, calendar_view, heatmap, trigger_proposal), markup (annotated_text, diff, transcript, annotated_image), memory (session_brief, agent_tasks, deferred_list), tools (scratchpad, timer, counter), structure (network, tree, sankey). The agent prompt now teaches three families — show the data / show the writing / show the thinking — instead of v1-vs-v2. Family F memory components (session_brief / agent_tasks / deferred_list) carry user-interaction prompts (correct / cancel / pursue) the renderer surfaces as inline buttons. Added a `Restart agent thread` affordance on Session Detail so existing sessions can pick up a newer agent prompt without losing local history (managed sessions are version-pinned at create time per the Anthropic docs).

Detail in [CHANGELOG.md](../CHANGELOG.md#unreleased).

**What `main` looks like today:** scaffold + 22 phases of substrate + Observatory design system + 54 artifact components + cron triggers + session continuity + universal reply + session lifecycle + ambient sources / reflexes / living artifacts + Vocabulary v2 thinking primitives + OSS scaffolding (LICENSE, CI matrix, CodeQL, Dependabot). Onboarding plays a 5-step cinematic. The agent has memory across turns within a local session.

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
| **21** | **Sources, Reflexes, Living Artifacts** — observation surface (polled_url + mcp skeleton + webhook schema + demo), agent-authored watchers (`reflex_proposal` → approve → fire), in-place artifact updates (`subscribes_to` + version history), per-session priority run queue, ambient SSE feed at `/api/events` |
| **22** | **Vocabulary v2** — 30 new component types (thinking / negotiation / decision / orchestration / time / markup / memory / tools / structure), the "Showing the work" review screen at Profile → Help & reference, Family F latent interactions wired (`correction_prompt` / `cancel_prompt` / `pursue_prompt`), `Restart agent thread` affordance on Session Detail for picking up prompt updates without losing local history |

---

## What's deferred (not yet built)

These are explicitly *out of scope* for the current release but live in the backlog:

- **MCP transport wire-up** — Phase 21 added the Source primitive and an MCP source kind, but the actual `@modelcontextprotocol/sdk` integration is a skeleton. MCP sources sit in `configuring` with a clear `last_error` until wired. Drop-in replacement.
- **Webhook ingress endpoint** — schema accepts `kind: 'webhook'` but there's no HTTP receiver / HMAC verification yet. The kind is hidden from the create UI until it works.
- **Promote-to-skill** — when a reflex has fired enough times, propose saving it as a reusable template the user can attach to other sessions. Phase 21 stretch goal, deferred.
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

Natural candidates after Phase 21:

1. **MCP transport wire-up** — add `@modelcontextprotocol/sdk` and finish [`src/orchestrator/mcpClient.ts`](../src/orchestrator/mcpClient.ts). Sources of `kind: 'mcp'` already persist; this unblocks them. The architecture is MCP-shaped; this is a focused dep + transport task.
2. **Webhook receiver** — POST `/api/sources/webhook/:path` with HMAC verification → `ingestObservation`. Once wired, re-add `webhook` to `CREATABLE_KINDS` in the SourcesScreen.
3. **Live draft preview during streaming** — when `artifact.ready` is queued and the agent is mid-stream, show a "draft" placeholder card in the feed with the live text. Closes the visible gap between "scan-bar working" and "card appears."
4. **Briefing auto-generation** — when the feed is empty or stale (>24h since latest), trigger the agent to compose a single `Briefing` artifact. Populates the slot at the top of the feed.
5. **Search narrowing** — chips for type/session/date on the Search screen.
6. **Voice ingest** — Whisper local or via Anthropic's audio path when it's beta. Closes the only obviously disabled affordance.
7. **Per-session memory store integration** — mirror the reference pattern; gives the agent durable cross-managed-session memory.
8. **Promote-to-skill** — when a reflex has fired N+ times successfully, propose saving it as a reusable template the user can attach to other sessions.

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
