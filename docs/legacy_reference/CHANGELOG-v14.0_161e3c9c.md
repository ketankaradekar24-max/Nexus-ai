# NexusAI v14.0

## Summary

v14.0 rebuilds the interface, completes the chat flows (stop, edit, regenerate, temporary chats, history search, export), adds real live-information providers with visible sources and timestamps, fixes a citation bug in web search, and tightens security (explicit Content-Security-Policy, no third-party scripts, escape-first Markdown).

## Image generation (new)

- **Images view** (sidebar): prompt, size (256 to 1024 px), generate, gallery, download and delete with confirmation.
- **Provider.** Any OpenAI-compatible `/images/generations` endpoint: a local bridge such as LocalAI, or a paid cloud provider. Set `IMAGE_BASE_URL`, `IMAGE_MODEL`, and `IMAGE_API_KEY` if needed. Blank means disabled, and the view explains what to set.
- **Safety.** Prompts are capped at 1000 characters and sizes are whitelisted. Responses must be real PNG or JPEG bytes. Files are stored under `workspace/images/` with a random id and served with `nosniff`. Generation is rate-limited to 6 per minute.
- **Not verified.** No live image provider was available in this environment. The provider path is tested with the mock and unit tests only.

## Fixes

- **Web search links.** DuckDuckGo results were redirect wrappers (`//duckduckgo.com/l/?uddg=…`). They are now decoded to the publisher's URL, and anything that is not http(s) is dropped. SearXNG results also carry `publishedDate`.
- **Orphan turns.** Attachment and vision checks now run before any database write. A rejected message no longer leaves a user turn with no reply.
- **Stop generation.** Stopping keeps the text produced so far, saved as a reply marked `stopped`. Previously the partial text was discarded.
- **Summary drift.** Editing or regenerating removes the conversation summary if it covered removed turns.
- **Unknown API routes** return JSON 404 instead of the single-page app shell.
- **Memory updates.** Editing a memory re-embeds it, so semantic retrieval follows the correction.
- **Port in use** gives a clear message and exits, instead of a bare stack trace.
- **Test script.** `npm test` runs `node --test` (the earlier `node --test tests/` form fails on Node 22).
- **Core test** updated for the renamed `webSearchRequested` variable; its behaviour is unchanged.

## Interface (public/)

- Rebuilt: warm-neutral palette, serif wordmark and headings, hairline borders, one restrained accent, light and dark themes. No gradients, glows or decorative icons.
- No CDN scripts, fonts or analytics. The theme script is an external file so the strict CSP can allow it.
- Markdown renderer (`public/markdown.js`) escapes everything before adding tags. It supports headings, emphasis, inline and fenced code with copy, nested lists, tables, quotes and http(s) links only.
- Views: Chat, Agent, Website builder, Research and live, Memory, Settings.
- Chat: stop, edit and resend, regenerate, copy, read aloud, dictation (where supported), attachments, web-search toggle, temporary chat toggle, model picker, sources panel, history search with snippets, rename and delete, Markdown and JSON export.
- Responsive: the sidebar becomes an overlay below 900 px; the layout has no horizontal scroll at 390 px.

## Backend

- `POST /api/chat/stream` accepts `replaceFromSequence` (edit) and `regenerate` (re-answer), `temporary`, and returns `sources` in the `meta` event. The `done` event reports `stopped`, `timedOut` and `saved`.
- `GET /api/chat/conversations/search?q=` (declared before `/:id`), `GET /api/chat/conversations/:id/export?format=markdown|json`.
- Temporary chats are hidden from history and skipped by memory retrieval and suggestions. A sweep removes them after 24 hours (hourly timer).
- `PATCH /api/memory/:id` edits a memory. `DELETE` reports 404 for unknown ids.
- `GET /api/live/weather|currency|news|football|cricket|intent` return `{status, source, fetchedAt, data | message}`.
- Live context is injected into chat automatically when a question matches a provider. The model is told the source, the fetch time, and when data is unavailable not to state any value.
- Explicit Helmet Content-Security-Policy (`useDefaults: false`, no `upgrade-insecure-requests`).
- Schema v7: `conversations.is_temporary`, `messages.stopped`, `messages.sources_json`, `memory_items.updated_at`. Apply with `npm run migrate:v7` (idempotent).

## Checklist status (from the v13 master list)

| Item | Status |
| --- | --- |
| package.json dependency list empty | Fixed in the supplied archive. All nine runtime dependencies are declared, and every `require()` in the code is covered by `package.json` |
| helmet missing | Declared (`helmet ^8.0.0`) and now configured with an explicit CSP |
| `npm start` MODULE_NOT_FOUND | Static check passes. `npm install` could not be run in this session (registry access was blocked), so run it once on your machine |
| `.env.example` copy failed | File present; updated with the v14 live-data keys |
| Server startup validation | Partial. Configuration warnings and friendly database errors existed; port-in-use handling added |
| Chat response errors and streaming | Fixed: error events, partial replies on stop, optimistic turns reverted on failure |
| History loading errors | Search, export and temporary-chat filtering added. Existing queries unchanged and not run against a live database |
| Stale server process | Partial. Port-in-use message added; no automatic process management |
| Agent features unverified | UI flow tested against a mock. Backend agent loop not run against a live model |
| Research features unverified | Citation bug fixed. Live web search not run from this environment |
| Website builder unverified | UI flow tested against a mock. Generated projects not built by a live model |
| Memory features unverified | Create, edit, delete and approve tested in the UI against a mock; the database path is not run live |
| Model routing needs validation | Unit-tested routing rules; live routing needs your models |
| Vision needs validation | Unchanged; requires an Ollama vision model and was not run here |
| Voice needs validation | Browser-native code paths; not tested with real audio |
| Image generation (new) | Mock-tested in the browser and unit-tested; not run against a live provider |
| Security needs testing | CSP and escape-first rendering verified in the browser; upload and tool-permission tests still need a live run |

## Not implemented in this release

Conversation branches, LaTeX rendering, cricket scores, stock prices, pause and resume for agent tasks, build-error detection in the website builder, image editing, audio transcription, video understanding, multi-user authentication, Redis job queue, structured logging and monitoring, and public deployment.

## Verification

- `node --check` on every JavaScript file: pass.
- `node --test`: 39 of 39 pass (the four image tests are new). Covers search link decoding, live-data intent and parsing, export helpers, LIKE escaping, vector maths, the v7 schema, route ordering and CSP wiring.
- Browser suite (Playwright) against a mock API that implements the same streaming, stop, edit and regenerate contract, with the strict CSP enforced: 41 of 41 pass, including the image flow. Screenshots reviewed for desktop and 390 px phone layouts.

## Apply after upgrading

1. Back up the `nexus_ai` database and the `workspace/` folder.
2. Keep your existing `.env`; add `NEWS_RSS_URLS`, `FOOTBALL_DATA_API_KEY` (optional) and `LIVE_DATA_TIMEOUT_MS` from `.env.example`.
3. Run `npm install`, then `npm run migrate:v6` (if not yet applied) and `npm run migrate:v7`.
4. Run `npm run db:check`, then `npm start`.
5. Test one chat, one stop, one edit and one regenerate before relying on them.
