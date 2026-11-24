# NexusAI v11.0

## Reliability fixes
- Fixed environment initialization order in the server. The previous server referenced `path` before declaring it, which could stop startup with a temporal-dead-zone `ReferenceError`.
- Centralized project-root `.env` loading so the web server, database pool, migration scripts, database diagnostic and benchmark use the same configuration.
- In local development, project-root `.env` values override stale PowerShell environment variables. Production continues to prefer injected environment variables.
- Added explicit MySQL connection timeout and bounded connection-pool settings.
- Improved `/api/health` to report database state and a basic AI-provider/model availability state.
- Improved server-side MySQL error messages so authentication, refused connections, missing databases and timeouts are distinguishable.
- Added the missing `scripts/db-setup-help.js` referenced by `npm run db:setup:help`.
- Updated the sidebar health indicator so it does not show a connected/green state when MySQL is offline.

## Verification boundaries
- Unit tests and JavaScript syntax checks are run for this release.
- A live MySQL login, Ollama generation, OpenAI-compatible request, browser session and every feature workflow still require testing on the user's machine.
- This release does not upgrade the underlying model's intelligence or make NexusAI equivalent to ChatGPT. Model quality depends on the configured provider/model and hardware or API budget.
