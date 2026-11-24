# SUB AI — Multi-Model Autonomous AI Platform

SUB AI is a full-stack, multi-model AI workspace built with React 19, TypeScript, Tailwind CSS, Express, Drizzle ORM, Cloud SQL (PostgreSQL), Firebase Authentication, and the `@google/genai` SDK alongside optional BYOK adapters for OpenAI, Anthropic, xAI, and Ollama.

## Core Workspaces

- **Chat Workspace**: Real-time SSE streaming, model switching, thinking/reasoning display, web search grounding, branching conversation tree (edit & branch, regenerate, sibling navigation), continue/stop generation, feedback, search, pin, archive, temporary 24-hour chats, rolling summaries, shareable read-only snapshots (`?share=`), and Markdown/JSON export.
- **Live Search & Deep Research**: Multi-query decomposition, live retrieval via SearXNG (`SEARXNG_URL`) or Gemini Google Search grounding, SSRF-protected page fetching (`cheerio`), domain reliability classification (`high` / `standard` / `unverified`), cited Markdown reports, and export.
- **Image Studio & Visual Q&A**: Text-to-image, reference-image editing, prompt enhancement, aspect ratios (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`), resolution controls, Visual Q&A image inspection, project assignment, and persistent gallery storage.
- **Autonomous App Builder**: Multi-file React/TypeScript/Tailwind code generation, isolated `esbuild` virtual filesystem compilation with automated repair loops, dependency allowlist & secret-leakage verification, responsive sandboxed preview, checkpoints with rollback, and ZIP export.
- **Voice Studio**: Real-time full-duplex audio WebSocket gateway (`/ws/live` via Gemini Live 16kHz PCM in / 24kHz PCM out with barge-in) plus batch audio transcription and TTS synthesis.
- **Documents & Data Lab**: Upload PDF, DOCX, CSV, XLSX (ZIP-bomb-safe XML parser), PPTX, code, and images; chunked multi-document Q&A; CSV/XLSX dataset profiling, browser Web Worker JavaScript transform sandbox, Recharts visualizations, and formula-safe CSV export.
- **Coding Intelligence**: Generate, explain, debug, refactor, review, and write unit tests with server-side `esbuild.transform` syntax diagnostics.
- **Projects, Memory, Usage & Evals**: Project-scoped instructions/files/conversations, user-approved memory extraction, BYOK encrypted credential vault, token/latency/cost analytics, reproducible evaluation suites, and full account data export/deletion.

## Architecture & Setup

1. **Install dependencies**: `npm install`
2. **Configure environment** (copy `.env.example` or inject runtime secrets):
   - `GEMINI_API_KEY`: Required for Gemini text, grounding, image, live voice, transcription, and TTS models.
   - `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`: Cloud SQL PostgreSQL connection details.
   - `KEY_ENCRYPTION_SECRET`: Recommended 32+ char secret for AES-256-GCM BYOK encryption at rest.
   - Optional providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `OLLAMA_BASE_URL`, `SEARXNG_URL`.
3. **Database schema**: Defined in `src/db/schema.ts` and pushed via Drizzle (`src/db/drizzle.config.ts`).
4. **Development**: `npm run dev` (starts Express + Vite middleware + `/ws/live` on port `3000`).
5. **Production build & start**:
   ```bash
   npm run build
   npm start
   ```
6. **Verification**:
   ```bash
   npm run lint
   npm test
   ```
