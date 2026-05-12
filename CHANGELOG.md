# Changelog

All notable changes to Pocket Agent are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Phase 21: Sources, Reflexes, Living Artifacts (the ambient agent)

The substrate evolves from a reactive turn-taker into an ambient agent.

- **Sources** — first-class objects alongside Sessions. A Source is a long-lived connection to an external feed; supported kinds are `polled_url`, `mcp` (transport skeleton), `webhook` (schema-only), and the built-in `demo`. Sources emit `Observation`s into a per-source ring buffer (configurable cap, default 200). Attach a Source to a Session and recent observations land in the agent's kickoff via a `<recent_observations>` XML block. Full CRUD + per-session attach UI under **Profile → Ambient sources**.
- **fake_pulse demo source** — seeded disabled on first boot. Toggling on emits a synthetic `{energy, mood, focus, hr_resting, hour}` payload every minute so reflexes and living artifacts can be tested end-to-end without wiring an external service.
- **Reflexes** — agent-authored watchers. The agent can emit a new `reflex_proposal` component, which renders as a PROPOSED REFLEX card with Approve / Dismiss. Approved reflexes fire automatically when matching observations arrive, debounced and event-driven. Pause / Resume / Delete per reflex from the session detail.
- **Living artifacts** — any artifact can declare `subscribes_to`. When a matching observation arrives, the system re-runs the agent in place; the card updates with a pulsing **LIVE** badge and an "Updated N×" link that opens a version history sheet. Prior versions are preserved in a new `artifact_versions` table.
- **Per-session run queue** — user > trigger > reflex > artifact_update priority. All four entry points share the queue, so trigger fires, reflex fires, and in-place updates never collide with each other or with a user ingest on the same session.
- **`/api/events` ambient SSE feed** — single long-lived stream the web client subscribes to once. Forwards observation / reflex / artifact-updated / queue-lifecycle events. Drives the **ambient banner** above the bottom nav ("Agent is on a reflex" / "Agent updating an artifact"). Per-connection backlog is bounded with a drop-oldest policy.
- **`reflex_proposal` artifact component** — 24th component type. Renders inline approval. Conditions, debounce, source name, and a kickoff prompt preview shown before the user commits.
- **Agent prompt v3** — teaches the agent the `reflex_proposal` component, the `<recent_observations>` block format, and `subscribes_to` on artifacts. Includes the "use sparingly" rule for reflexes.

### Changed

- Repo flipped public; topics set; About populated.

### Infrastructure

- CI matrix across Node 20 / 22 / 24 on `pnpm type-check` and `pnpm build`.
- Least-privilege `permissions: contents: read` on the CI workflow.
- Dependabot config — weekly npm updates (grouped minor + patch), monthly GitHub Actions bumps.
- CodeQL workflow (`security-extended` query set) on push, PR, and a weekly cron.

## [0.1.0] — 2026-05-10

The initial open-source release.

### Added

- **Onboarding** — five-step cinematic introducing inputs, sessions, artifacts, and the first session creation.
- **Feed, Sessions, Artifact Detail, Search** — full local-first workspace.
- **23 artifact component types** — data row, paragraph, heading, sparkline, line chart, bar chart, table, quote, alert, timeline, progress (bar + ring), sources, status list, image, sandboxed HTML embed, checklist, comparison, divider, map, question set (typed inline answers), markdown (sanitized rich text), key/value list, link preview.
- **Universal Reply** — every artifact has a Reply button that creates a typed ingest in the same managed session, so the agent retains conversational context across turns.
- **Session continuity** — one local session reuses one Anthropic managed session across many ingests; auto-falls-back to fresh when the managed session terminates or 404s.
- **Run queue + banner** — sending a new ingest while the agent is mid-stream queues it and shows the live count in both the IngestSheet and the feed scan-bar.
- **Per-session agent triggers** — cron-style scheduled runs with a `node-cron` registry; create, edit, pause, delete with preset schedules.
- **Session lifecycle** — Archive (pauses triggers, hides from main list), Mark complete, Reactivate, Delete with typed `delete` confirmation.
- **Privacy & data screen** — export all data as JSON, clear all data preserving agent config, transparent reckoning of what's local vs sent to Anthropic.
- **Browser desktop notifications** — fired when an artifact arrives with `notify: true` and the window is hidden; permission flow surfaced as a real toggle status.
- **Native ConfirmDialog** — replaces `window.confirm()` everywhere; supports type-to-confirm for destructive actions.
- **Profile + settings** — display name (round-tripped through `/api/profile` and included in agent prompts), theme (auto/light/dark, follows OS), accent (6 swatches), density (editorial/balanced/instrument), atmosphere (calm/signature/intense), grain toggle.
- **Component Library + Agent States** — built-in user-facing reference screens accessible from Profile.
- **Trigger scheduler** — runs server-side, drains the SSE stream silently, persists artifacts, updates `last_fired_at`.
- **File upload pipeline** — multipart `POST /api/ingests`, Anthropic Files API integration, local byte cache for previews (Files API refuses re-download of user uploads), inline photo rendering in the session timeline.
- **Bootstrap CLI** — `pnpm bootstrap-agent` provisions or syncs the managed agent to your Anthropic org; detects prompt-hash drift and updates in place.
- **Search** — FTS5-backed full-text search across artifact text with `<mark>` snippets.
- **Double-click-safe submit** — `useRef` lock defeats fast multi-clicks on Send.
- **Agent prompt instructs `question_set` over `checklist`** for collecting user input — fixes the "user can only check boxes, can't answer" failure mode.

### Architecture

- **Tech stack** — React 18 + Vite + TypeScript on the web; Hono on Node 20+ for the API; better-sqlite3 + FTS5 for storage; zustand for state; node-cron for scheduling; Anthropic Managed Agents SDK for the agent.
- **Two non-negotiable orchestration patterns** preserved throughout `streamSession()`: stream-first ordering and the idle-break gate.
- **Migrations** — transactional, advance-on-success.

### Deferred for later releases

- Voice ingest
- Per-session MCP servers + memory store integration
- Multi-user / auth / hosted demo
- Capacitor wrap for iOS/Android
- Live artifact-draft preview during streaming
- Briefing auto-generation
- Search narrowing (chips for type / session / date)

[Unreleased]: https://github.com/dogum/pocket-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dogum/pocket-agent/releases/tag/v0.1.0
