# Security Policy

## Reporting a vulnerability

Pocket Agent is a single-user local-first application. Most of its threat surface concerns:

- The Anthropic API key that lives in your local `.env`
- The local SQLite database, which is unencrypted at rest
- The local HTTP server bound to `127.0.0.1` (not exposed to the internet by design)
- HTML embeds rendered by the agent (sandboxed in iframes)

If you find a security issue — **please do not file a public issue.** Instead, open a private security advisory on GitHub: <https://github.com/dogum/pocket-agent/security/advisories/new>

If GitHub advisories aren't an option, contact the maintainer directly through the repository's profile contact info.

## What counts as a security issue

- A path that leaks the user's `.env`, `data/app.db`, or `data/uploads/*` to anywhere outside the local machine
- A way for agent-generated HTML to escape its sandboxed iframe
- A way to bypass the typed-confirmation gate on `DELETE /api/data/all`
- Any RCE / arbitrary file write via the API server
- Prompt-injection escalations that cause the agent to exfiltrate local data through tools it has access to

## What doesn't (today)

Pocket Agent has **no auth** because the API binds only to localhost. If you expose the port to the internet (e.g. via tunneling), you're on your own — there are no security guarantees outside of local-only operation.

## Response timeline

This is a small project run by a small number of people. We'll acknowledge within a few days and aim for a fix or disclosure timeline within 30 days for confirmed issues. Coordinated disclosure preferred.

## Scope of the bug bounty

There isn't one. Sorry. We'll credit you in the changelog if you'd like.
