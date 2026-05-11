# Contributing to Pocket Agent

Thanks for thinking about contributing — this is an early-stage open-source project and any kind of help is welcome: bug reports, design feedback, code, docs, or ideas about where the substrate should grow next.

## Ground rules

- **Be kind.** This is a small project run by a small number of people. Assume good faith both ways.
- **Don't ship behavior changes that break the agent contract** without proposing them first. The contract is the `Artifact` schema in [`shared/artifact.ts`](shared/artifact.ts) plus the system prompt in [`src/agent-prompt.ts`](src/agent-prompt.ts). They must stay in sync.

## Local setup

```bash
git clone https://github.com/dogum/pocket-agent.git
cd pocket-agent
pnpm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY (must have Managed Agents beta access)
pnpm bootstrap-agent
pnpm dev
```

Pocket Agent runs entirely on your machine. There's no test server, no shared state — your fork's data lives in `data/app.db`.

## Reporting bugs

Use the **Bug report** issue template. The two most useful things to include:

1. **Steps to reproduce** — what you did, what you expected, what happened. Screenshots help, especially for UI bugs.
2. **The artifact JSON, if relevant.** If the agent emitted something that broke the renderer or parsed incorrectly, paste the raw JSON. You can find it in `data/app.db` via `sqlite3 data/app.db "SELECT components FROM artifacts WHERE id = '...';"` or via the **Privacy → Export all data** affordance.

## Proposing changes

Discuss bigger changes in an issue before writing code. Small bugfixes can go straight to a PR.

### Adding a new artifact component

This is the most common kind of extension. To add a component, change **seven** places in lockstep:

1. Add the interface in [`shared/artifact.ts`](shared/artifact.ts) and add it to the `ArtifactComponent` discriminated union.
2. Add a renderer + `case` in [`web/src/components/artifact/ArtifactRenderer.tsx`](web/src/components/artifact/ArtifactRenderer.tsx).
3. Add CSS classes in [`web/src/styles/components.css`](web/src/styles/components.css) under a `c-<name>` selector.
4. Add the type to `VALID_COMPONENT_TYPES` in [`src/orchestrator/parseArtifact.ts`](src/orchestrator/parseArtifact.ts).
5. Add a sample in [`web/src/screens/ComponentLibraryScreen.tsx`](web/src/screens/ComponentLibraryScreen.tsx) so users discover it.
6. Add a `### \`<name>\`` section in [`src/agent-prompt.ts`](src/agent-prompt.ts) so the agent knows when to use it.
7. Add a `case '<name>':` branch in [`web/src/lib/artifactToMarkdown.ts`](web/src/lib/artifactToMarkdown.ts) so export-as-Markdown stays complete.

After landing, run `pnpm bootstrap-agent` against your own Anthropic agent to push the updated prompt. Mention in your PR that the prompt changed so other contributors know to rerun bootstrap.

### Adding a server route

1. Create a new file in `src/routes/`.
2. Export a `<name>Routes(...)` function that returns a `Hono` instance.
3. Mount it in `src/index.ts`.
4. Add typed client methods in `web/src/lib/api.ts`.

### Database migrations

Migrations live inside `migrate()` in [`src/db.ts`](src/db.ts). They run transactionally via the `advance(version, fn)` helper — only bump `schema_version` if the inside ran cleanly. **Never edit a shipped migration**; always add a new `migration_NNN` and a new `advance(NNN, …)` line.

## Code style

There's no linter or formatter enforced yet. Match what's around you:

- TypeScript strict mode, no `any` where avoidable
- Two-space indent, single quotes for strings, no semicolons in TS where Prettier-style would skip them (look at neighboring files)
- Comments only when the *why* isn't obvious from the code — see existing files for the bar
- No new third-party deps without a one-line justification in the PR description

## Running checks before you push

```bash
pnpm type-check     # server + web
pnpm build          # production bundle
```

Both must be clean. CI runs them on every PR via `.github/workflows/ci.yml`.

## Commit messages

Conventional-commits-ish but loose: prefix with `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:` where it fits. Examples:

- `feat: question_set component for typed-input replies`
- `fix: parse error when checklist items omit action`
- `chore: bump @anthropic-ai/sdk to 0.95`

Squash on merge unless there's a specific reason to preserve history.

## Releases & changelog

Manual SemVer + manual [`CHANGELOG.md`](CHANGELOG.md). The maintainer bumps the version in `package.json`, updates the changelog, commits, tags `vX.Y.Z`, and `gh release create vX.Y.Z`.

## License

By contributing, you agree your contributions will be licensed under the project's [MIT License](LICENSE).
