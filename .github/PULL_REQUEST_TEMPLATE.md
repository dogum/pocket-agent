## What changed

<!-- 1–3 sentences. The "what" is mostly visible in the diff; lean into the "why". -->

## Why

<!-- The problem this PR solves. Link the issue if there is one. -->

## How to verify

<!-- Steps a reviewer can run locally to confirm the change works. -->
- [ ] `pnpm type-check` clean
- [ ] `pnpm build` clean
- [ ] Manual: …

## Schema / contract changes

<!-- Check all that apply. -->
- [ ] `shared/artifact.ts` modified
- [ ] `src/agent-prompt.ts` modified (requires `pnpm bootstrap-agent` after merge)
- [ ] `src/db.ts` migration added
- [ ] New `/api/*` route or breaking endpoint change
- [ ] Renderer / component-library sample added or removed

## Notes for the changelog

<!-- One bullet for CHANGELOG.md. Skip if no user-visible change. -->
