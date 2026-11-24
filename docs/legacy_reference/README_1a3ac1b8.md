# NexusAI v14.0 — Local-first AI workspace

NexusAI is an independent educational AI assistant project. It is inspired by common AI chat product workflows, but it is not ChatGPT and does not contain OpenAI proprietary source code, weights, training data, or internal infrastructure.

See [REA-RESEARCH-INTEGRATION.md](REA-RESEARCH-INTEGRATION.md) for the supplied REA archive review and adopted workflow.

See [REVERSE_ENGINEERING_NOTES.md](REVERSE_ENGINEERING_NOTES.md) for the public engineering patterns used and the limits of this reverse-engineering exercise.

## What is included

- Professional responsive chat UI with dark/light themes, history, Markdown/code rendering, attachments and streaming.
- Ollama local-model provider (default) and optional OpenAI-compatible provider adapter.
- MySQL conversations, message history, saved memories, approval-based memory suggestions, persistent agent task history and uploaded-file metadata.
- Optional local embeddings using Ollama `/api/embed`; hybrid memory retrieval combines semantic similarity, keyword overlap and recency.
- Optional web search using a configured SearXNG instance or DuckDuckGo HTML endpoint.
- PDF, DOCX, TXT, Markdown, CSV, JSON and HTML text extraction.
- Website builder endpoint that asks the configured provider for a structured file bundle, writes files only inside `workspace/`, and previews them in a sandboxed iframe.
- Calculator utility and bounded agent loop with web search, calculations, project listing/inspection, website generation and website editing. Agent actions are allowlisted; shell/code execution is not exposed.
- Website project generation/editing endpoints, sandboxed previews, ZIP export (requires `archiver`), transactional project replacement and up to 20 rollback snapshots per project.
- Dedicated Agent Workspace with an orchestrated specialist workflow: coordinator planning, role-specific researcher/developer/debugger/tester prompts, dependency ordering, allowlisted tool execution, independent review and persistent action records. Role-specific model overrides are optional; without them, roles use the same configured provider/model.
- Task-aware model routing for general, coding, reasoning and vision requests. Explicit model selection overrides automatic routing; optional per-task and specialist model overrides are configurable.
- Automatic memory candidate suggestions after completed chats. Suggestions remain pending until the user approves them; users can reject them. Long conversations receive rolling model-generated summaries while recent messages remain in the active context.
- Browser-native voice dictation and read-aloud controls where SpeechRecognition and SpeechSynthesis are supported.
- OCR for uploaded images and scanned PDFs when Tesseract OCR and Poppler (`pdftoppm`) are installed; PDF OCR is limited to the first 10 pages and 20 MB.

## Hardware note for the supplied ASUS laptop

The known machine has an Intel i5-12500H, 8 GB RAM and an NVIDIA RTX 2050 with 4 GB VRAM. Start with a small quantized model such as `qwen3:1.7b`. Model performance and GPU offload vary by Ollama version, driver, context length and available RAM. Do not assume that a 4B/7B model will run comfortably. Check actual allocation with `ollama ps`.

## Requirements

- Windows 10/11 64-bit or Linux/macOS
- Node.js 20+
- MySQL 8+
- Ollama (for the default local AI provider)


## v11.0 reliability update

The v11.0 release centralizes project-root `.env` loading across the server, database pool, migrations and diagnostics. During local development, `.env` takes precedence over stale PowerShell environment variables; production deployments should inject environment variables and must not rely on a local `.env`. The server health endpoint reports MySQL and basic AI-provider availability separately.

For MySQL setup help, run `npm run db:setup:help`. Then edit the project-root `.env` and run `npm run db:check` before `npm start`. Never share or commit the `.env` file or its password.

## Setup on Windows PowerShell

1. Install Ollama: https://ollama.com/download/windows
2. Pull a small model:

   ```powershell
   ollama pull qwen3:1.7b
   ```

3. Pull an embedding model only if you want semantic memory retrieval:

   ```powershell
   ollama pull nomic-embed-text
   ```

4. Create the database and app user. Log into MySQL as an administrator and run `schema.sql` first. Then create a dedicated app user (replace the password):

   ```sql
   CREATE USER IF NOT EXISTS 'nexus_app'@'localhost' IDENTIFIED BY 'CHANGE_ME';
   GRANT SELECT, INSERT, UPDATE, DELETE ON nexus_ai.* TO 'nexus_app'@'localhost';
   FLUSH PRIVILEGES;
   ```

   If MySQL connects through `127.0.0.1`, also create/grant that host variant if your MySQL account configuration requires it.

5. In the project folder:

   ```powershell
   Copy-Item .env.example .env
   ```

6. Edit `.env` and set `DB_PASSWORD` to the app user's password. Keep `AI_PROVIDER=ollama` and `MOCK_MODE` is not used in this version.
7. Install dependencies:

   ```powershell
   npm install
   ```

8. Verify the exact `.env` file and MySQL login before starting the server:

   ```powershell
   npm run db:check
   ```

   This diagnostic reads `.env` from the project root regardless of the terminal's current directory, hides the password, tests authentication, and lists tables. If it reports `ER_ACCESS_DENIED_ERROR`, use the host-specific `ALTER USER` commands printed by the diagnostic in MySQL Workbench, then put the exact same password in the project-root `.env`.

9. Back up your database, then apply the v4 migration (after `schema.sql` has been applied):

   ```powershell
   npm run migrate:v4
   ```

   This adds memory-candidate and persistent agent-task tables. Do not skip this migration. Run migrations with a MySQL account that has CREATE TABLE and REFERENCES privileges. The regular app account can remain limited to SELECT, INSERT, UPDATE and DELETE.

9. Apply the v5 migration:

   ```powershell
   npm run migrate:v5
   ```

   This adds persistent conversation summaries. Do not skip this migration if you want long-conversation context compression. Run it using the migration-capable MySQL account; then restore the least-privilege application credentials in `.env`.

10. Run checks and start:

   ```powershell
   npm run check
   npm test
   npm start
   ```

11. Open http://localhost:3000.

## Configure models

The `.env` default is `OLLAMA_MODEL=qwen3:1.7b`. The app lists installed Ollama models in the selector. Auto-select uses heuristic task classification; set `MODEL_GENERAL`, `MODEL_CODING`, `MODEL_REASONING`, `MODEL_VISION`, `MODEL_RESEARCHER`, `MODEL_DEVELOPER`, `MODEL_DEBUGGER`, or `MODEL_TESTER` to override a task/role. For OpenAI-compatible providers, `OPENAI_MODELS` can list additional model IDs served by the same configured endpoint/key. A manually selected model takes precedence in chat. Routing is heuristic and does not establish model quality. To use image understanding, install a compatible Ollama vision model and set `OLLAMA_VISION_MODEL` in `.env`. Image attachments (up to three, 4 MB each) are passed to that model in chat. Text document uploads are included in chat context.

## Web search

Web search is disabled by default. To enable it, configure one of:

- Recommended: run your own SearXNG instance, set `SEARCH_PROVIDER=searxng` and `SEARXNG_URL=http://127.0.0.1:8080`.
- Experimental: set `SEARCH_PROVIDER=duckduckgo`. Public HTML search endpoints can change, rate-limit or block automated requests; this is not a guaranteed service.

The Chat view's Web toggle retrieves search snippets and passes them to the model. Search is disabled by default; DuckDuckGo HTML scraping is experimental and SearXNG requires a separately running instance. The Research page shows raw results. NexusAI must not claim web research occurred if the search provider is disabled or failed.

## OCR setup

Image OCR requires Tesseract OCR on PATH. Scanned PDF OCR additionally requires Poppler (`pdftoppm`) on PATH. The PDF pipeline rasterizes at most 10 pages at 140 DPI and limits input PDFs to 20 MB. It is local processing; install the binaries separately on Windows.

## Website builder

Open **Website builder**, describe the project, and generate. The backend asks the configured provider for JSON containing project files. Generated files are written under `workspace/<project-name>/` and displayed in a sandboxed iframe with no same-origin permission. Treat generated code as untrusted; inspect it before deployment. The starter does not execute generated JavaScript on the server.

## API endpoints

- `GET /api/health` — server and database status
- `GET /api/chat/models` — installed models
- `GET /api/chat/conversations` — conversation list
- `GET /api/chat/conversations/:id` — messages for one conversation
- `POST /api/chat/stream` — SSE chat stream; body `{ message, conversationId?, model?, webSearch?, fileIds? }`
- `POST /api/files` — multipart upload field `files`
- `GET /api/search?q=...` — web search
- `GET /api/memory` / `POST /api/memory` / `DELETE /api/memory/:id` — saved memory
- `GET /api/memory/candidates` and `POST /api/memory/candidates/:id/approve|reject` — review suggested memories
- `GET /api/agent/tasks` and `GET /api/agent/tasks/:id` — persistent task history and checkpoints
- `POST /api/projects/generate` — create website files in workspace
- `GET /api/projects/list` — list workspace projects
- `/workspace-preview/<project>/index.html` — sandbox-CSP preview route for generated local projects
- `POST /api/tools/calculate` — safe arithmetic calculator
- `POST /api/agent/orchestrate` — bounded coordinator/specialist workflow with dependency ordering, specialist input refinement and independent review. Role prompts can use configured specialist model overrides.
- `POST /api/evaluation/run` — run a small model smoke benchmark (not a scientific ranking).
- `GET /api/projects/:name/snapshots` and `POST /api/projects/:name/rollback/:snapshotId` — list and restore project snapshots.
- `POST /api/agent/run` — bounded tool-using agent (`goal`, optional `model`, `maxSteps`). Allowlisted tools: web search, calculator, project list/files/read, project generation and project editing.
- `POST /api/ocr/:id` — OCR an uploaded image or scanned PDF using Tesseract; PDFs additionally require Poppler `pdftoppm`
- `POST /api/projects/edit` — regenerate/update a saved website project
- `GET /api/projects/:name/files` and `GET /api/projects/:name/download` — list/export project files

## Known limitations — do not mistake these for completed features

- This is a working starter architecture, not a ChatGPT-equivalent trained model.
- Local model capability is limited by model quality and the laptop's memory/VRAM.
- Web search requires a configured provider and may be rate-limited.
- Saved memory semantic retrieval is best-effort and needs the embedding model installed. Automatic memory suggestions require another model call after a chat response; extraction is probabilistic and sensitive-data filtering is not guaranteed. User approval is required before saving. Per-user memory isolation is not implemented.
- File extraction supports text-based PDFs and DOCX; scanned PDFs can be processed through the OCR endpoint when Tesseract and Poppler are installed.
- Image generation needs an OpenAI-compatible image endpoint you run or pay for. Images are saved under `workspace/images/` and are not encrypted. Generation is limited to 6 requests per minute and sizes 256 to 1024 px.
- Image understanding requires a separately installed vision-capable Ollama model and uses a small number of attached images per request.
- Browser automation, true independently hosted specialist agents, automatic background task resumption, automated testing of generated websites, and secure code execution are not implemented. The orchestrator uses role-separated model calls and a shared configured provider; it is not a fleet of independent autonomous agents. Persistent task records/checkpoints are saved, but interrupted tasks are not automatically resumed. Project ZIP export is implemented but requires installing the `archiver` dependency. Code execution is intentionally disabled. Never run model-generated code directly on the host. Use an isolated container or sandbox with strict limits if you add execution.
- Authentication and per-user data isolation are not implemented. The API now rejects non-loopback clients and checks same-origin on mutating browser requests, but this is a local-development boundary, not account security. The server binds to `127.0.0.1` by default and refuses production-mode API requests. Keep this app on localhost. Do not expose it to the public internet until authentication, authorization, CSRF protections, upload isolation, and deployment hardening are added.
- The project uses third-party CDN assets for Markdown, sanitization, highlighting and fonts; an offline deployment should vendor these assets locally.

## Security checklist before public deployment

1. Implement authentication and per-user ownership checks for every conversation, file, memory and project.
2. Add CSRF protection and strict CORS/origin policy.
3. Keep `.env`, uploads and workspace outside the public static directory.
4. Scan uploads, enforce quotas, and delete temporary files according to retention policy.
5. Sandbox generated previews and any future code execution on a separate origin/container.
6. Add structured logging, request IDs, quotas and backup/restore procedures.
7. Never expose API keys to browser JavaScript.

## Verification

Run `npm run check` for a cross-platform JavaScript syntax check and `npm test` for unit tests covering calculator safety, workspace path validation, agent JSON/allowlist behavior, task routing, memory candidate filtering, completion-review validation and orchestration dependency validation. Run `npm run benchmark` with Ollama/provider configured for a small live model smoke benchmark. These tests do not replace a live integration test with MySQL and Ollama.

## Project structure

```text
nexus-ai/
├── public/                 # Original NexusAI frontend
├── routes/                 # Chat, files, memory, search, projects and agent APIs
├── services/ai/            # Ollama and OpenAI-compatible providers
├── services/               # Search, memory, agent, embeddings, document parsing, vision
├── tools/                  # Calculator, safe file writing, disabled runner
├── middleware/             # Rate limits and deployment guard
├── workspace/              # Generated website projects (not public)
├── uploads/                # Uploaded files (created at runtime; not public)
├── db.js
├── schema.sql
├── schema-v4.sql
├── schema-v5.sql
└── server.js
```


## Honest capability and deployment limits

This is an educational independent implementation, not a ChatGPT clone or model training package. The local model determines answer quality; a small 1.7B model will be materially weaker than hosted frontier models. The agent loop is deliberately bounded and exposes an allowlisted set of research, calculator and website-project tools; it is not a general autonomous computer-use agent. Website generation/editing is model-generated and must be reviewed and tested before deployment.

Still not implemented: user accounts and per-user data isolation, production-grade authentication/CSRF, sandboxed code execution, browser automation, true real-time voice conversations, multi-agent collaboration, background task resumption, generated-site browser testing, and comprehensive load/security testing. Public deployment is intentionally blocked by the local-development middleware.

## v5 additions and limits

- Specialist orchestration plans up to eight allowlisted tasks, validates dependency graphs, asks role-specific specialist prompts to refine inputs, executes sequentially, and asks a separate reviewer to check evidence. Unless specialist model environment variables are configured, the same underlying model performs these role calls.
- Project generation/editing now stages a replacement directory before swapping it into place. Existing project versions are copied into `.nexus-snapshots/` (up to 20 snapshots per project); use the snapshot endpoints to restore.
- Long-conversation summaries are stored in `conversation_summaries`; apply `npm run migrate:v5` after v4.
- `/api/evaluation/run` and `npm run benchmark` run only a tiny smoke suite. Passing it does not mean a model is ChatGPT-level or broadly reliable.
- The API rejects remote IP clients and mutating requests from unknown browser origins, but there are still no user accounts, user ownership checks or production-grade auth.

## Additional setup notes

- Install dependencies with `npm install`; this installs `archiver`, which is required for project ZIP downloads.
- Agent execution uses the configured model and may fail with small models that cannot reliably emit valid JSON tool decisions.
- For image OCR, install Tesseract OCR and ensure `tesseract.exe` is on PATH (or configure `TESSERACT_PATH`).
- Web search is not magically free or guaranteed: DuckDuckGo HTML mode is experimental; SearXNG requires a separately operated instance.
- Keep the server bound to `127.0.0.1`; do not expose it to the internet until authentication, authorization, CSRF, ownership checks and security review are implemented.


## v7.0 changes

See [CHANGELOG-v7.0.md](CHANGELOG-v7.0.md) for upload validation, cleanup, file deletion and bounded agent execution updates.


## v10.0 database diagnostics

- The server now loads `.env` from the directory containing `server.js`, not from whichever folder PowerShell happens to be in.
- Added `npm run db:check` to show the active DB host, port, username and database (never the password), verify MySQL authentication, identify the matched MySQL account and list schema tables.
- `/api/health` now returns a safe database error code such as `ER_ACCESS_DENIED_ERROR`, so the UI can show the actual class of failure instead of only "Database offline".
- This does not guess or reset your MySQL password. The diagnostic prints the exact host-specific account reset commands if authentication fails. Live MySQL and Ollama tests must be run on your computer.


## v12.0 intelligence and agent-quality update

- Adds task-specific response-quality instructions for general, reasoning, coding, research and vision prompts.
- Adds complexity-aware guidance for longer and multi-part requests.
- Improves intent routing for research and technical prompts, while preserving explicit model selection.
- Adds bounded Ollama sampling controls and output-token settings in `.env`.
- Strengthens single-agent and orchestrated-agent instructions around evidence, failure recovery, scope and verification.
- Adds `GET /api/intelligence/status` for an honest capability/provider status report.
- Adds `npm run intelligence:check` to verify the configured AI provider and installed local model.

These are application and orchestration improvements, not foundation-model training. Actual answer quality remains bounded by the selected model, context window, hardware, source availability and tool integrations. The included model evaluation is a small smoke test, not a scientific benchmark or a ChatGPT-equivalence score.


## v13.0 repair migration
If upgrading from v12.0, keep your existing `.env`, workspace and database. Back up the database first, then run `npm run migrate:v6` from the project root. This creates the memory-candidate and agent-task tables referenced by the current routes, plus the conversation summary table. For low-VRAM machines, set `OLLAMA_NUM_GPU=0`, `AI_NUM_CTX=2048`, and `AI_NUM_PREDICT=512`; this prefers CPU inference and may be slower. Set `SEARCH_PROVIDER=duckduckgo` to enable the optional external search route. Live search depends on outbound network access and may be blocked by the search provider.


## v14.0 upgrade (read this first)

Keep your existing `.env`, `workspace/` and database. Back up the database, then from the project root:

```bash
npm install            # installs every dependency declared in package.json
npm run migrate:v6     # only if you have not applied it yet
npm run migrate:v7     # new in v14: temporary chats, stopped replies, sources, editable memories
# Image generation needs no migration. Set IMAGE_BASE_URL and IMAGE_MODEL in .env to enable it.
npm run db:check
npm start              # opens http://127.0.0.1:3000
```

Migrations are safe to re-run. New `.env` keys (copy them from `.env.example`): `NEWS_RSS_URLS`, `FOOTBALL_DATA_API_KEY`, `LIVE_DATA_TIMEOUT_MS`.

### What changed in v14.0

- **Interface rebuilt.** A calm, typographic design with warm neutrals, a light and dark theme, and no decorative gradients or AI-style effects. It loads nothing from third-party origins: no CDN scripts, fonts or trackers.
- **Chat.** Stop generation (the reply so far is kept and marked "Stopped early"), edit a message and resend, regenerate a reply, temporary chats (kept out of history and memory, removed after a day), search across chat history with snippets, export a chat as Markdown or JSON, copy messages, read replies aloud, dictate with the microphone where the browser supports it, and keyboard shortcuts.
- **Live information.** Weather (Open-Meteo), currency rates (Frankfurter, ECB reference rates), headlines (RSS feeds you configure) and football fixtures (football-data.org, needs a free key). Each result shows its source and fetch time. If a provider is not configured, NexusAI says so and does not invent a value.
- **Research.** Web results link to the publisher. DuckDuckGo redirect wrappers are now decoded, so citations point to the real page.
- **Memory.** Saved memories can be edited as well as deleted; edits are re-embedded for retrieval.
- **Security.** Explicit Content-Security-Policy, unknown `/api` routes return JSON 404 instead of the app shell, Markdown output is escaped before rendering, and only http(s) links are emitted.
- **Reliability.** Attachment and image checks run before anything is written, so a rejected message no longer leaves an orphan turn. A clear message appears if the port is already in use.

### Feature status (honest)

| Area | Status in v14.0 |
| --- | --- |
| Chat: streaming, stop, edit, regenerate, history search, export, temporary chats | Implemented; flows covered by browser tests against a mock API |
| Chat: branches (multiple versions of a reply) | Not implemented. Editing an earlier turn replaces it and everything after it |
| LaTeX rendering | Not implemented. Formulas show as plain text |
| Weather, currency, headlines | Implemented against public endpoints; needs outbound network access |
| Football scores | Implemented; requires `FOOTBALL_DATA_API_KEY`; otherwise reports "not configured" |
| Cricket scores, stock prices | Not connected. Reported as unavailable; no score or price is shown |
| Agent workspace: plan, run, verify, stop | Implemented. Pause and resume are not implemented |
| Website builder: generate, preview, edit, snapshots, ZIP | Implemented from v13; the preview has device-width modes. Build-error detection is not implemented |
| Memory: save, edit, delete, approve suggestions | Implemented |
| Voice dictation and read-aloud | Browser-native (Web Speech API). Not tested with a real microphone or speaker |
| Image generation | Implemented through any OpenAI-compatible `/images/generations` server. Disabled until `IMAGE_BASE_URL` and `IMAGE_MODEL` are set. Not tested against a live image provider |
| Image editing, audio transcription, video | Not implemented |
| Multi-user authentication, public deployment | Not implemented. The API is local-only and refuses public deployment |

### What was verified in this release

- Syntax checks on every JavaScript file and 35 unit tests (`npm test`) covering search link decoding, live-data intent and parsing, export, LIKE-escaping, vector maths, the v7 schema and route ordering. These run without database or network access.
- Browser checks (36) against a mock API that implements the same streaming contract, with a strict Content-Security-Policy. They cover streaming, Markdown, sources, stop, edit, regenerate, history search, temporary chats, failure recovery, every view, dark theme, and a phone layout with no horizontal scroll.

**Not verified in this release:** a live `npm install`, a live MySQL session, Ollama model replies, outbound calls to the weather, currency, RSS and football providers, and voice input or output. Run `npm run db:check`, `npm run intelligence:check` and the chat flows on your machine before relying on them.


## v15 workspace update

- Adds a Claude-inspired mobile workspace switcher for Chat, Projects, Code and Artifacts, while retaining the full desktop sidebar.
- Projects is the Website Builder workspace. Artifacts aggregates locally saved website projects and generated images with preview/download links.
- Code workspace can generate source through the configured AI provider and perform limited static checks for JavaScript, JSON, CSS and HTML. TypeScript, Python and SQL checks are explicitly reported as not configured. Code is never executed by the editor.
- Adds API-Sports Cricket live fixture integration. Set `CRICKET_API_KEY` (and optionally `CRICKET_API_BASE_URL`) in `.env`; live score availability and coverage depend on the provider plan. Without a key, NexusAI reports that live cricket is not configured rather than inventing scores.
- Live cricket response includes provider attribution and fetch timestamp, like other live data.

### v15 upgrade

1. Back up the database and `workspace/` folder.
2. Keep your existing `.env`; add `CRICKET_API_BASE_URL` and `CRICKET_API_KEY` if you want cricket scores.
3. Run `npm install`, `npm run check`, `npm test`, `npm run db:check`, then `npm start`.
4. Test Code generation with your configured AI provider and test live cricket only after configuring a valid provider key.

This release does not include private ChatGPT/Claude models, automatic image editing, video understanding, or guaranteed live-data coverage. Cloud APIs may require paid accounts.
