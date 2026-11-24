# NexusAI / Sub AI — Phase 0 Competitive Capability Specification & Architecture Blueprint

> **Status**: Phase 0 Research, Specification & Planning Document  
> **Scope**: Architecture, provider matrix, data model, security boundaries, evaluation framework, and phased implementation roadmap for the **NexusAI** (`metadata.json` app identity) / **Sub AI** multi-capability AI platform.  
> **Strict Rule**: No runtime feature implementation occurs in Phase 0. Claims about provider quality, live search, or execution capabilities are bounded by verified integrations and measured evaluations.

---

## 1. Repository & Reference Audit Summary

### 1.1 Active Repository Baseline
- **Runtime**: React 19 + Vite 8 + TypeScript 7 + Tailwind CSS v4 (`@tailwindcss/vite`).
- **Installed Server Packages**: `express` (`4.21.2`), `tsx` (`4.21.0`), `dotenv` (`17.2.3`), `@google/genai` (`^2.4.0`).
- **Current Gaps**:
  - No `server.ts` Express entry point or `/api/*` routes exist yet (`npm run dev` runs `vite` directly).
  - `@google/genai` is at `^2.4.0` and must be upgraded to `>= 2.29.1` (or `>= 3.3.0`) in Phase 3 for Gemini 4 models, `ThinkingLevel`, Gemini Live (`gemini-3.8-live`), and Gemini 3.8 TTS.
  - `/public/assets/aistudio/` contains legacy v2–v15 MySQL/Vanilla-JS reference snapshots including a sample `.env_4aff258f` inside `public/`, which must be removed from static serving before Phase 2/deployment.
  - No database, authentication, SSE streaming, sandboxing, or test suite is wired yet.

### 1.2 Lessons Extracted from Legacy Reference Artifacts (`README.md`, `REVERSE_ENGINEERING_NOTES.md`, `REA-RESEARCH-INTEGRATION.md`, `schema-v7.sql`)
- **Preserve & Modernize**:
  - Model-agnostic provider adapter pattern; explicit user selection always overrides heuristic routing.
  - Staged, evidence-first research and agent workflows separating **observations**, **inferences**, and **unknowns**.
  - Rolling conversation summaries (`conversation_summaries`) paired with recent verbatim turns, temporary chats (`is_temporary`), stopped partial-message persistence (`stopped`), and cited `sources_json`.
  - Approval-gated memory candidates (`memory_candidates` -> `memory_items`) with editable memory entries.
  - Project snapshots/rollbacks (`<= 20` snapshots per project) and atomic workspace staging.
- **Upgrade Beyond Legacy Prototype**:
  - Replace single-user localhost-only MySQL prototype with **multi-user PostgreSQL + authenticated ownership checks**.
  - Replace plain `child_process` / disabled execution stubs with **isolated sandboxed preview & controlled execution boundaries**.
  - Add true **conversation branching** (tree/parent-child message model instead of destructive truncation on edit).
  - Add **Gemini native multimodal, search grounding, image generation/editing, and WebSocket Live Voice** alongside optional OpenAI / Anthropic / xAI / Ollama adapters.

---

## 2. Competitive Capability Matrix & Provider Mapping

| Capability Area | Observable Benchmark (ChatGPT / Claude / Gemini / Perplexity) | NexusAI / Sub AI Implementation Strategy | Reality & Integrity Boundary |
| :--- | :--- | :--- | :--- |
| **Multi-Model Chat & Reasoning** | Streaming responses, thinking/reasoning modes, branching, artifacts, markdown/math/code | Unified `ModelProviderAdapter` supporting Gemini 4 (`gemini-4-hydrogen`, `gemini-4-neon`, `gemini-4-carbon`), OpenAI, Anthropic, xAI, and Ollama; parent-child message DAG for branching; KaTeX + Markdown + syntax highlighting | Never claim two models have identical intelligence; surface capability flags (`supportsThinking`, `supportsVision`, `contextWindow`) per model |
| **Live Internet & Deep Research** | Real-time search, inline clickable citations, multi-step research synthesis | Adapter supporting **Google Search grounding** (`googleSearch` + `urlContext` in Gemini), **SearXNG**, or **Brave/Tavily/DuckDuckGo**; normalized `SourceCitation[]` with reliability heuristics and fetch timestamps | Never claim data is live if search failed or is disabled; separate retrieved source facts from model synthesis |
| **Image Studio & Vision** | Text-to-image, image editing, aspect ratios, high-res output, visual Q&A | `ImageProviderAdapter`: Gemini (`gemini-3.1-flash-lite-image`, `gemini-nano-banana-2.1`) and OpenAI-compatible `/images/generations` & edits; multimodal vision via Gemini / OpenAI / Anthropic / Ollama Vision | Requires billing-enabled API key for Nano Banana / Imagen / OpenAI Images; zero static placeholders |
| **Autonomous Website & App Builder** | Multi-file React/TS app generation, live preview, terminal/error loop, checkpoints, ZIP export, deploy | Orchestrated multi-file planner -> virtual/confined project workspace -> sandboxed Vite/esbuild or WebContainer/isolated runner -> error diagnostics & auto-repair -> snapshots & ZIP export | Isolated per-project sandbox with dependency allowlists, zero host filesystem escape, no secret leakage to client bundle, explicit user approval for destructive/deploy actions |
| **Live Voice & Multimodal** | Low-latency duplex voice, barge-in interruption, audio transcription, TTS | **Real-time duplex voice**: WebSocket bridge to Gemini Live (`gemini-3.8-live` / `gemini-3.8-live-extended-thinking`) at 16kHz PCM in / 24kHz PCM out. **Batch STT**: `gemini-3.5-transcribe` / Whisper. **TTS**: `gemini-3.8-flash-lite-tts` / `gemini-3.8-flash-tts` | Explicitly distinguish true WebSocket real-time streaming from unary audio-file transcription or browser Web Speech fallback |
| **File & Document Intelligence** | PDF/DOCX/XLSX/CSV/PPTX/code Q&A, table extraction, multi-doc synthesis | Server-side extractors (`pdf-parse`, `mammoth`, `xlsx`, PPTX XML/zip parser, image/code readers) + chunking + optional `gemini-embedding-2` hybrid retrieval | Enforce MIME + magic-byte checks, size limits, and per-user storage ownership |
| **Coding & Data Intelligence** | Multi-file refactoring, tests, CSV/SQL/Python analysis, charts | Multi-file AST/context indexer for coding; **controlled sandbox** (Pyodide/WebAssembly Python in isolated worker or containerized runner with memory/CPU timeouts) + Recharts/SVG interactive charts | Never `eval` or `exec` arbitrary model/user code on the Express host process |
| **Evaluation & Benchmarks** | Measurable quality, latency, citation & build success tracking | Curated JSONL benchmark datasets + deterministic assertions + rubric scoring (`gemini-decision-1` / test harness) recording latency, pass rate, and regression diffs | Never claim parity with ChatGPT/Claude/Gemini without measured test-run evidence |

---

## 3. Core System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Frontend SPA (React 19 + TypeScript + Tailwind v4 + Motion + Lucide)        │
│ Modules: Chat · Deep Research · Image Studio · App Builder · Live Voice ·   │
│          Documents · Data Lab · Projects · Memory · Admin · Evaluations     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTPS (SSE / REST / WebSocket + Bearer Auth)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│ Express Backend Gateway (server.ts)                                         │
│ Middleware: Helmet CSP · CORS · Rate Limiter · Auth Guard · Zod Validation  │
├─────────────────┬─────────────────┬──────────────────┬──────────────────────┤
│ AI Orchestrator │ Search &        │ App Builder &    │ File, Voice &        │
│                 │ Deep Research   │ Sandbox Engine   │ Image Services       │
│ - Provider Hub  │ - SearchAdapter │ - ProjectFS      │ - Parsers (PDF/XLSX) │
│ - Model Registry│ - URL Fetcher   │ - Dep Allowlist  │ - ImageAdapter       │
│ - Cost/Tokens   │ - Citation Mgr  │ - Build/Error    │ - Live WS Bridge     │
│ - Retry/Failover│ - Multi-Step    │ - Snapshot/ZIP   │ - TTS/STT Router     │
└────────┬────────┴────────┬────────┴─────────┬────────┴──────────┬───────────┘
         │                 │                  │                   │
┌────────▼─────────────────▼──────────────────▼───────────────────▼───────────┐
│ Persistence & Storage Layer                                                 │
│ - PostgreSQL (Users, Encrypted Keys, Conversations, Message DAG, Memories,  │
│               Projects, Files, Usage Ledger, Agent Tasks, Eval Runs, Audit) │
│ - Confined Object/File Storage (uploads/, images/, workspaces/ outside pub) │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Capability Specifications (Sections A – I)

### Section A — Advanced AI Chat Engine
- **Required Providers & APIs**: `@google/genai` (`>= 3.3.0`), OpenAI SDK/REST (`/v1/chat/completions` or `/v1/responses`), Anthropic SDK/REST (`/v1/messages`), xAI REST (`/v1/chat/completions`), Ollama (`/api/chat`, `/api/tags`).
- **Backend Services**:
  - `ConversationService`: CRUD, pin, archive, temporary-chat TTL cleanup (24h), search (`ILIKE`/full-text), Markdown/JSON export, permissioned share tokens.
  - `BranchingService`: Tree-structured messages (`id`, `parent_message_id`, `branch_index`, `is_active_leaf`) allowing non-destructive edit-and-resend, regenerate, and sibling navigation (`< 1 / 3 >`).
  - `ContextBudgetService`: Token estimator per model context window, sliding window of recent turns, and rolling `conversation_summaries` compression without overwriting recent explicit instructions.
  - `StreamOrchestrator`: Unified SSE emitter (`delta`, `thinking`, `tool_call`, `tool_result`, `source`, `usage`, `done`, `error`), `AbortController` cancellation preserving partial output (`stopped = true`), and structured error recovery.
- **Frontend Modules**: `ChatWorkspace`, `MessageTreeNavigator`, `MarkdownRenderer` (GFM tables, KaTeX math, syntax-highlighted code blocks with copy buttons), `Composer` (attachments, model/thinking selector, web toggle, voice mic, stop/continue), `FeedbackControls`, `ShareExportModal`.
- **Database Tables**: `conversations`, `messages` (self-referencing `parent_id`), `conversation_summaries`, `message_feedback`, `conversation_shares`, `memory_items`, `memory_candidates`.
- **External Dependencies**: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex`, `highlight.js` (or `shiki`), `zod`.
- **Security Considerations**: Sanitize rendered HTML/Markdown (no raw `dangerouslySetInnerHTML`), validate share permissions server-side, prevent prompt-injection leakage from untrusted memories/attachments, enforce `is_temporary` exclusion from memory extraction.
- **Cost Considerations**: Token counting per request; rolling summarization throttled to threshold crossings (e.g., >60% context budget); automatic prompt caching where supported.
- **Testing Strategy**: Unit tests for tree branching traversal, token-budget truncation, SSE parser/abort cleanup, and Markdown XSS sanitization.
- **Acceptance Criteria**: Real SSE streaming from configured provider; stop retains partial reply; editing earlier prompt creates a new branch without deleting prior branch; math/tables/code render cleanly.
- **Known Limitations**: Exact tokenizer counts vary by non-Gemini providers when using local byte/word heuristics before final API `usage` metadata arrives.
- **Implementation Phase**: **Phase 3** (streaming & providers) & **Phase 4** (branching, memory, summarization, export/share).

### Section B — Live Internet and Real-Time Information
- **Required Providers & APIs**:
  - Primary: Gemini `googleSearch` grounding + `urlContext` tool (`@google/genai`).
  - Independent Search Adapters: Self-hosted SearXNG (`SEARXNG_URL`), Tavily / Brave Search API (`SEARCH_API_KEY`), or configurable RSS/weather/currency endpoints (Open-Meteo, Frankfurter).
- **Backend Services**:
  - `SearchAdapter`: Normalizes results into `{ id, title, url, domain, snippet, publishedAt, retrievedAt, reliabilityTier, provider }`.
  - `DeepResearchService`: Multi-stage pipeline — (1) query decomposition into sub-questions, (2) parallel search + selective URL extraction with SSRF protection, (3) source deduplication & reliability heuristics (official docs/gov/edu/primary publishers vs. forums/unknown), (4) evidence matrix construction, (5) cited report generation with explicit `[1]` links and progress SSE events (`planning`, `searching`, `reading`, `synthesizing`).
- **Frontend Modules**: `ResearchWorkspace`, `SearchSourceDrawer`, `CitationBadge` (clickable external link + snippet popover), `ResearchProgressStepper`, `ReportExporter`.
- **Database Tables**: `research_runs`, `research_steps`, `research_sources`, `messages.sources_json`.
- **External Dependencies**: `cheerio` (for safe HTML text extraction in URL reader), `undici` / Node `fetch` with abort timeouts.
- **Security Considerations**: Strict SSRF guard on URL fetching (allow `http:`/`https:` only, block private/loopback/metadata IP ranges after DNS resolution), strip scripts/HTML before passing page text to LLM as untrusted evidence, validate URLs before rendering clickable links.
- **Cost Considerations**: Cap deep-research subtasks (default max 5 sub-queries, max 8 fetched pages per run) and truncate extracted page content to token budgets.
- **Testing Strategy**: Unit tests for SSRF IP/URL validator, search result normalizer, citation index matching, and graceful fallback error states when search providers are unconfigured or rate-limited.
- **Acceptance Criteria**: Live queries display real retrieved URLs, domain/date metadata, and fetch timestamps; disabled/failed search never fabricates "live" facts; deep research emits live step progress and downloadable cited Markdown reports.
- **Known Limitations**: Paywalled, JS-rendered SPA, or anti-bot websites may block server-side URL extraction; DuckDuckGo HTML scraping is inherently fragile and treated only as experimental fallback.
- **Implementation Phase**: **Phase 7**.

### Section C — Image Generation and Image Intelligence
- **Required Providers & APIs**:
  - Gemini Image Models: `gemini-3.1-flash-lite-image` (standard text-to-image & editing), `gemini-nano-banana-2.1` (1K/2K/4K, wide aspect ratios, `googleSearch`/`imageSearch` grounding; requires paid API key via `paid_model_flow`).
  - Optional Adapter: OpenAI Images (`/v1/images/generations`, `/v1/images/edits`).
  - Visual Q&A: Multimodal `generateContent` via `gemini-4-hydrogen` / `gemini-4-neon` / OpenAI / Anthropic / Ollama Vision.
- **Backend Services**:
  - `ImageProviderAdapter`: Unified `generateImage()`, `editImage()`, `enhancePrompt()`, `analyzeImage()`.
  - `ImageStorageService`: Stores generated binary PNG/WEBP files in confined `storage/images/<userId>/` (never `public/`), serves via authenticated `/api/images/:id/file` with `path.resolve` confinement, supports project attachment and deletion.
- **Frontend Modules**: `ImageStudioView`, `PromptEnhancerBar`, `AspectRatioAndQualityControls`, `ReferenceImageDropzone` (for img2img / editing), `ImageGalleryGrid`, `ImageCompareLightbox`, `VisualQAModal`.
- **Database Tables**: `generated_images` (`id`, `user_id`, `project_id`, `provider`, `model`, `prompt`, `enhanced_prompt`, `negative_prompt`, `aspect_ratio`, `resolution`, `quality`, `style_preset`, `parent_image_id`, `file_path`, `created_at`).
- **External Dependencies**: Built-in Node `fs/promises` + `@google/genai` (or `sharp` if server-side resizing/thumbnails are added).
- **Security Considerations**: Per-user ownership check on image fetch/delete, MIME & magic-byte validation on reference uploads, per-user rate limiting on expensive image calls, safe prompt/metadata handling.
- **Cost Considerations**: Image generation is significantly costlier than text; track per-image estimated cost in `usage_logs`, enforce configurable daily/hourly user quotas, and trigger `paid_model_flow` before calling paid Gemini image models.
- **Testing Strategy**: Adapter contract tests with mocked HTTP/SDK fixtures, file-path confinement tests, quota enforcement tests, and UI verification for gallery/lightbox/download/delete.
- **Acceptance Criteria**: Real images generated and persisted on disk; reference image upload drives real image editing/variations; gallery supports inspect, regenerate, download, save-to-project, and delete.
- **Known Limitations**: Negative prompts are natively supported only by certain providers (ignored or folded into prompt instructions with clear UI disclosure where unsupported); free-tier keys cannot invoke paid image models.
- **Implementation Phase**: **Phase 5**.

### Section D — Autonomous Website and Application Builder
- **Required Providers & APIs**: Reasoning/coding models (`gemini-4-neon`, `gemini-4-carbon`, `gemini-4-hydrogen`, Anthropic Claude, OpenAI) via structured JSON / multi-file diff outputs.
- **Backend Services**:
  - `BuilderOrchestrator`: (1) Requirements analysis & architecture plan, (2) Stack & dependency selection against curated allowlist, (3) Multi-file scaffold generation, (4) Isolated build & dev-server execution, (5) Compiler/type/runtime log capture & automated repair loop (bounded retries, e.g., max 3 auto-fix passes), (6) Checkpoint snapshots (`<= 20` per workspace), rollback, ZIP export, and deployment integration hook (requiring explicit user confirmation).
  - `SandboxRunnerService`: Runs each generated project inside an **isolated execution environment**:
    - *Option 1 (Browser-native WebContainers / Sandboxed Iframe + esbuild-wasm)* for client React/Vite apps with zero server host RCE risk.
    - *Option 2 (Containerized/ephemeral worker sandbox)* with cgroups CPU/RAM/disk/time limits, non-root UID, restricted egress network, and confined project root (`storage/workspaces/<userId>/<projectId>/`) for full-stack Node builds.
  - `DependencyPolicyService`: Validates `package.json` dependencies against an explicit allowlist / blocklist and rejects postinstall lifecycle script execution (`--ignore-scripts` or sandboxed install).
- **Frontend Modules**: `AppBuilderWorkspace` (Architecture Plan tab, File Explorer tree, Multi-tab Code Editor with syntax highlighting & dirty-state diffing, Live Responsive Preview with Desktop/Tablet/Mobile viewports, Terminal & Diagnostics drawer, Checkpoint Timeline & Rollback, ZIP Export & Deploy Confirmation modal).
- **Database Tables**: `builder_projects`, `builder_files`, `builder_checkpoints`, `builder_runs` (build logs, exit codes, diagnostics), `deployments`.
- **External Dependencies**: `archiver` (ZIP export), `esbuild` / container runtime or WebContainer API, `@monaco-editor/react` or CodeMirror 6 (`@uiw/react-codemirror`).
- **Security Considerations (Critical)**:
  - **Never** execute generated code in the main Express process or grant host filesystem access.
  - Sandbox preview iframes on an isolated origin or strict `sandbox="allow-scripts"` (without `allow-same-origin` on shared origin) with strict CSP.
  - Scan generated code to ensure no server `.env` secrets are injected into frontend bundles.
  - Require explicit user confirmation modal before destructive file wipes, rollback overwrites, or external hosting deploys.
- **Cost Considerations**: Multi-file generation and auto-repair loops consume high output tokens; enforce max repair iterations (3), file-size caps, and token-budget tracking per build run.
- **Testing Strategy**: Path-traversal tests, dependency allowlist rejection tests, snapshot/rollback integrity tests, malformed LLM JSON recovery tests, and end-to-end sample build ("build an e-commerce storefront" -> compiles without TS/Vite errors -> exports valid ZIP).
- **Acceptance Criteria**: User prompt produces a multi-file runnable React/TS/Tailwind project, installs approved deps in isolation, compiles with live preview across breakpoints, surfaces real compiler/runtime errors, auto-fixes or lets user edit files, rolls back to checkpoints, and exports a runnable ZIP.
- **Known Limitations**: Full-stack database-backed apps generated inside the builder require either browser-only persistence or provisioned external targets; external hosting deployment (Vercel/Cloud Run/Netlify) requires user-authorized OAuth/provider credentials.
- **Implementation Phase**: **Phase 9** (coupled with Workspace/Projects foundations in Phase 9, after core Chat & Security foundations).

### Section E — Live Voice and Multimodal Interaction
- **Required Providers & APIs**:
  - **Real-time Voice Streaming**: Gemini Live API (`gemini-3.8-live` and `gemini-3.8-live-extended-thinking`) over WebSocket (`ws` on Express <-> `ai.live.connect`) or OpenAI Realtime API.
  - **Live Speech-to-Speech Translation**: `gemini-3.5-live-translate-preview`.
  - **Batch Audio Transcription (STT)**: `gemini-3.5-transcribe` or OpenAI Whisper.
  - **Text-to-Speech (TTS)**: `gemini-3.8-flash-lite-tts` (unary WAV / streaming 24kHz PCM) and `gemini-3.8-flash-tts` (multi-speaker / Voice Design).
- **Backend Services**:
  - `LiveVoiceGateway`: Authenticated WebSocket server (`/ws/live`) bridging 16kHz little-endian PCM upstream and 24kHz PCM + `inputTranscription` / `outputTranscription` + `interrupted` + non-blocking tool responses downstream.
  - `SpeechService`: HTTP endpoints for audio-file transcription (`/api/voice/transcribe`) and TTS synthesis (`/api/voice/tts`).
- **Frontend Modules**: `LiveVoiceModal` / `VoiceDock` (mic permission & WebAudio `AudioWorklet` 16kHz capture, gapless `AudioBufferSourceNode` 24kHz playback scheduler, VAD/barge-in interrupt handling, live dual transcript, language & voice selector, clear UI badge distinguishing **Live Duplex Session** vs. **Audio File Transcription**), plus inline read-aloud & dictation in chat.
- **Database Tables**: `voice_sessions` (`id`, `user_id`, `conversation_id`, `mode`, `language`, `duration_ms`, `created_at`) + transcribed turns persisted in `messages`.
- **External Dependencies**: `ws`, `@types/ws` (server); Web Audio API (`AudioWorkletNode`, `MediaDevices.getUserMedia` — note: check `requestFramePermissions` / microphone permissions when implementing).
- **Security Considerations**: Authenticate WebSocket upgrade requests via session token, enforce max session duration and idle timeouts, validate PCM/audio payload sizes, never expose `GEMINI_API_KEY` to browser.
- **Cost Considerations**: Audio streaming incurs per-minute/token charges; cap idle sessions (e.g., 2 min silence auto-close) and display session timer.
- **Testing Strategy**: Audio chunk framing unit tests, WebSocket auth rejection tests, mock-stream barge-in interruption state tests, and real browser mic/speaker manual verification checklist.
- **Acceptance Criteria**: Real-time duplex voice responds with low-latency audio, stops immediately on user barge-in (`interrupted`), persists transcripts into conversation history, and clearly separates file transcription from live sessions.
- **Known Limitations**: Requires browser microphone permissions (`HTTPS` or `localhost`) and `AudioWorklet` support; Live Translation (`gemini-3.5-live-translate-preview`) does not accept custom system instructions or tools.
- **Implementation Phase**: **Phase 8** (or dedicated Voice milestone after Core Chat & Tools).

### Section F — File and Document Intelligence
- **Required Providers & APIs**: Server-side local parsers + Gemini multimodal (`gemini-4-hydrogen`, `gemini-4-neon`) + `gemini-embedding-2` for large multi-document semantic retrieval.
- **Backend Services**:
  - `FileIngestService`: Multipart upload with strict extension + magic-byte validation, max file size (e.g. 25 MB), SHA-256 deduplication, confined storage `storage/uploads/<userId>/`.
  - `DocumentExtractor`:
    - PDF (`pdf-parse` text + page metadata; fallback to Gemini multimodal PDF/image reading for scanned PDFs).
    - DOCX (`mammoth`), XLSX/CSV (`xlsx` -> structured JSON tables + Markdown preview), PPTX (slide XML extraction via `jszip`), TXT/MD/Code (UTF-8 detection + language tagging), Images (MIME-verified inline multimodal parts).
  - `DocumentIndexService`: Chunks long documents (`~1000` tokens with overlap), stores chunks & optional embeddings in PostgreSQL (`pgvector` if Cloud SQL extension enabled, or cosine similarity over JSONB/float arrays).
- **Frontend Modules**: `DocumentLibraryView`, `FilePreviewDrawer` (rendered tables for CSV/XLSX, code viewer, image preview, extracted text tabs), `MultiDocContextPicker` in Chat & Projects.
- **Database Tables**: `uploaded_files`, `document_chunks`, `conversation_files`, `project_files`.
- **External Dependencies**: `multer`, `@types/multer`, `pdf-parse`, `mammoth`, `xlsx`, `jszip`.
- **Security Considerations**: Never execute macros in `.xlsx`/`.docx`/`.pptx`, prevent ZIP-bomb decompression (`maxUncompressedBytes` check in `jszip`), sanitize filenames, enforce user ownership on download/preview/delete, clean up disk files on delete.
- **Cost Considerations**: Chunk retrieval sends only top-K relevant sections to the LLM instead of stuffing entire multi-hundred-page PDFs into every turn.
- **Testing Strategy**: Parser tests for malformed PDF/CSV/DOCX, ZIP-bomb size cap test, path-traversal filename tests, and multi-doc citation Q&A tests.
- **Acceptance Criteria**: All 8 file categories upload, preview cleanly, extract text/tables accurately, answer cross-document questions with file/page attribution, and delete cleanly from DB and disk.
- **Known Limitations**: Password-protected/encrypted PDFs and DRM-protected Office files cannot be extracted without user-supplied decryption.
- **Implementation Phase**: **Phase 6**.

### Section G — Coding and Data Intelligence
- **Required Providers & APIs**: Coding/reasoning models (`gemini-4-neon`, `gemini-4-carbon`, Anthropic, OpenAI) + controlled sandbox runtime.
- **Backend Services**:
  - `CodingIntelligenceService`: Multi-file repository context packing, structured diff/patch generation, unit-test generator, and static review/audit prompts.
  - `DataAnalysisService`:
    - Parses CSV/XLSX into typed schemas & summary statistics (row count, null rate, min/max/mean/median).
    - **Controlled Python Execution**: Runs Python data analysis (`pandas`, `numpy`, `matplotlib` or `duckdb`) exclusively inside an **isolated sandbox** (browser-side **Pyodide WebAssembly Web Worker** with zero host access and memory/time caps, or an isolated container runner with `--network=none` and read-only mounts). Never executes `python`/`node` on the Express server host.
    - SQL Assistant: Schema-aware SQL generator + read-only local DuckDB-Wasm / SQLite-in-memory query runner for uploaded CSVs (never connected to NexusAI's production PostgreSQL).
- **Frontend Modules**: `CodeAssistantView` (diff viewer, multi-file context picker, test generator, static lint diagnostics), `DataLabView` (spreadsheet grid, SQL/Python notebook cells in isolated Web Worker, interactive Recharts visualizations, CSV/report export).
- **Database Tables**: `analysis_notebooks`, `analysis_cells`, `code_sessions`.
- **External Dependencies**: `recharts` (interactive charts), `papaparse` / `xlsx`, `pyodide` (loaded in isolated browser Web Worker) or `@duckdb/duckdb-wasm`.
- **Security Considerations**: Zero host RCE — uploaded CSVs/code execute only inside memory/time-bounded WebAssembly Workers (or isolated `--network=none` containers); sanitize CSV formula injection (`=`, `+`, `-`, `@`) on export.
- **Cost Considerations**: Summarize table schemas + top 20 sample rows to the LLM rather than serializing 100,000 raw CSV rows into model context.
- **Testing Strategy**: Worker timeout/termination tests (infinite loop `while True` must abort cleanly), CSV formula-injection neutralization tests, SQL read-only validation tests, chart rendering verification.
- **Acceptance Criteria**: Users upload a CSV/XLSX, inspect summary stats, run AI-generated Python/SQL analysis in a sandboxed worker, view interactive charts, and export clean reports.
- **Known Limitations**: Browser-based Pyodide workers are bounded by browser tab RAM (~512MB–1GB) and cannot access private internal corporate databases.
- **Implementation Phase**: **Phase 8**.

### Section H — AI Provider and Capability Management
- **Required Providers & APIs**:
  - `GoogleGeminiAdapter` (`@google/genai`)
  - `OpenAIAdapter` (`/v1/chat/completions`, `/v1/images`, `/v1/audio`)
  - `AnthropicAdapter` (`/v1/messages`)
  - `XAIAdapter` (`/v1/chat/completions`)
  - `OpenAICompatibleLocalAdapter` (Ollama / vLLM / LM Studio)
- **Backend Services**:
  - `ModelRegistry`: Explicit capability metadata per model (`id`, `provider`, `displayName`, `contextWindow`, `maxOutputTokens`, `capabilities: { streaming, thinking, vision, tools, webGrounding, imageGen, audioIn, audioOut }`, `inputCostPer1M`, `outputCostPer1M`, `requiresPaidTier`).
  - `ProviderRouter`: Resolves user-encrypted BYOK key (AES-256-GCM) or server `process.env` key, applies exponential-backoff retry on transient `429`/`5xx`, optional user-opted failover chain, and timeout enforcement.
  - `UsageLedgerService`: Records prompt tokens, completion tokens, thinking tokens, image units, audio seconds, and estimated USD cost per user/provider/model.
- **Frontend Modules**: `ModelSelectorPopover` (grouped by provider with capability labels, never fake equality claims), `ModelComparisonView` (side-by-side multi-model prompt test), `ApiKeyVaultSettings` (for optional user BYOK third-party keys; note: `GEMINI_API_KEY` stays managed via AI Studio Secrets without UI prompts per platform rules), `AdminProviderHealthPanel`.
- **Database Tables**: `provider_configs`, `user_api_keys` (AES-256-GCM ciphertext, IV, auth tag, key hint), `usage_logs`, `audit_logs`.
- **External Dependencies**: Node `crypto` (AES-256-GCM + HKDF/master key from env).
- **Security Considerations**: Server-side encryption at rest for any user-supplied third-party keys; never return raw keys to frontend (masked last-4 only); strict SSRF checks on custom Ollama/OpenAI-compatible base URLs when non-admin users configure endpoints.
- **Cost Considerations**: Real-time usage aggregation, soft/hard per-user monthly budget alerts, and admin rate-limit sliders.
- **Testing Strategy**: Encryption/decryption roundtrip tests, adapter error-normalization tests (401/403/429/504), failover tests, and capability-gating tests (ensuring e.g. image gen is disabled on text-only models).
- **Acceptance Criteria**: Live availability reflects actual configured keys/runtimes; switching models updates UI controls based on explicit capability metadata; usage dashboard displays real recorded token & cost numbers.
- **Known Limitations**: Local Ollama availability depends on local runtime reachability from the backend host.
- **Implementation Phase**: **Phase 3** (core adapter + Gemini/OpenAI/Anthropic/xAI/Ollama) & **Phase 10** (admin, quotas, full usage analytics).

### Section I — Quality and Competitive Evaluation Framework
- **Required Providers & APIs**: Evaluates active configured adapters (Chat, Search, Image, Docs, Builder, Voice) and optional rubric scorer (`gemini-decision-1` or structured judge prompt).
- **Backend Services**:
  - `EvaluationRunnerService`: Executes versioned benchmark suites stored in `server/evals/datasets/*.json` covering:
    1. *Reasoning & Answer Quality* (verifiable logic/math/factuality prompts)
    2. *Coding Correctness* (generated code parsed/typechecked/tested in sandbox)
    3. *Search & Citation Accuracy* (validates returned URLs exist in retrieved `groundingChunks` / search results — detects hallucinated citations)
    4. *Streaming Reliability* (TTFT latency, chunk continuity, abort cleanup)
    5. *Document Extraction Accuracy* (fixture PDF/CSV/DOCX ground-truth assertions)
    6. *Website Builder Success & Responsiveness* (build exit code 0 + zero console/TS errors + viewport check)
    7. *Voice Latency & Security Regression* (TTFA, SSRF/path-traversal/XSS negative tests)
- **Frontend Modules**: `EvaluationsDashboard` (run suite selector, historical trend comparison across models/versions, per-case pass/fail inspection with exact inputs, outputs, latency ms, and token cost).
- **Database Tables**: `eval_suites`, `eval_runs`, `eval_case_results`.
- **External Dependencies**: Node `node:test` / `vitest` for CI regression suites + PostgreSQL persistence for live model eval runs.
- **Security Considerations**: Admin-only trigger for live paid-provider benchmark suites; cap concurrency to avoid quota exhaustion.
- **Cost Considerations**: Separate lightweight **smoke suite** (zero/low cost) from **full benchmark suite** with estimated token cost preview before run.
- **Testing Strategy**: Deterministic unit tests for assertion evaluators (citation-grounding checker, JSON schema checker, build verifier) run in CI without network; live eval runs explicitly stamped with model ID, timestamp, and sample size (`n`).
- **Acceptance Criteria**: Reproducible evaluation runs persist results to DB; citation validator catches ungrounded URLs; reports never extrapolate small smoke tests into unsupported superiority claims over ChatGPT/Claude/Gemini.
- **Known Limitations**: Automated LLM-as-judge scoring remains probabilistic; deterministic ground-truth checks are prioritized wherever possible.
- **Implementation Phase**: **Phase 11** (automated test & evaluation framework).

---

## 5. Relational Database Blueprint (PostgreSQL)

Core entities required across Phases 2–11 (using Drizzle ORM + PostgreSQL):
1. **Identity & Security**: `users`, `sessions`, `password_reset_tokens`, `user_preferences`, `user_api_keys`, `audit_logs`.
2. **Chat & Memory**: `projects`, `project_files`, `conversations`, `messages` (tree-structured via `parent_id`, `branch_index`, `stopped`, `sources_json`, `thinking_text`, `usage_json`), `conversation_summaries`, `message_feedback`, `conversation_shares`, `memory_items`, `memory_candidates`.
3. **Research, Media & Files**: `uploaded_files`, `document_chunks`, `generated_images`, `research_runs`, `research_steps`, `voice_sessions`.
4. **App Builder & Data Lab**: `builder_projects`, `builder_files`, `builder_checkpoints`, `builder_runs`, `analysis_notebooks`.
5. **Operations & Evaluation**: `provider_configs`, `usage_logs`, `eval_suites`, `eval_runs`, `eval_case_results`.

---

## 6. Revised Master Implementation Roadmap (Phases 1 – 12)

| Phase | Scope & Deliverables | Key Dependencies & Integrations |
| :--- | :--- | :--- |
| **Phase 1** | **Design System & Responsive Frontend Shell**: Dark/light `@custom-variant dark` theme, typography (`Plus Jakarta Sans` + `DM Sans` + `JetBrains Mono`), collapsible sidebar, top breadcrumb/action bar, responsive mobile/tablet/desktop navigation, keyboard shortcuts, and structured workspace shells. | Frontend only (`lucide-react`, `motion`, Tailwind v4) |
| **Phase 2** | **PostgreSQL Database, Auth & User Management**: Provision Cloud SQL PostgreSQL + Drizzle ORM (or user-approved DB), registration/login/logout, password reset flow, session auth, profile, preferences, encrypted 3P API key vault, account deletion, and cleanup of legacy `/public/assets/aistudio/` `.env` exposure. | Cloud SQL / `drizzle-orm` / `zod` / `helmet` / `express-rate-limit` |
| **Phase 3** | **Express Backend (`server.ts`), `@google/genai` Upgrade & Multi-Model Streaming**: Unified `ModelProviderAdapter` (Gemini 4, OpenAI, Anthropic, xAI, Ollama), model capability registry, SSE streaming, stop/retry/failover, usage/cost ledger. | `@google/genai@latest` (`>= 3.3.0`) |
| **Phase 4** | **Advanced Chat, Branching, Memory & Export**: Tree branching (edit/regenerate without history loss), Markdown + KaTeX + syntax highlighting, feedback, full-text history search, pin/archive/temp chats, rolling summarization, approval-gated memory, custom instructions, export & permissioned sharing. | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `highlight.js` |
| **Phase 5** | **Image Generation Studio & Vision**: Dedicated studio (`gemini-3.1-flash-lite-image`, `gemini-nano-banana-2.1` + optional OpenAI), img2img/editing, reference uploads, aspect ratio/quality/style presets, prompt enhancer, confined gallery, visual Q&A. | Paid API key prompt (`paid_model_flow`) for Nano Banana models |
| **Phase 6** | **File & Document Intelligence**: Secure multipart uploads (PDF, DOCX, TXT, CSV, XLSX, PPTX, images, code), text/table extraction, chunk indexing (`gemini-embedding-2`), preview drawer, multi-doc Q&A, secure deletion. | `multer`, `pdf-parse`, `mammoth`, `xlsx`, `jszip` |
| **Phase 7** | **Live Web Search & Deep Research**: `SearchAdapter` (Gemini `googleSearch` + `urlContext`, SearXNG/search APIs), SSRF-safe URL reader, reliability assessment, multi-step research progress tracker, clickable citations, exportable reports. | `cheerio` |
| **Phase 8** | **Coding Assistant, Sandboxed Data Lab & Live Voice**: Multi-file code review/refactor/tests; CSV/XLSX analysis with browser-isolated Pyodide/DuckDB-Wasm worker + Recharts; WebSocket Live Voice (`gemini-3.8-live`) + batch STT/TTS (`gemini-3.5-transcribe`, `gemini-3.8-flash-lite-tts`). | `ws`, `recharts`, Pyodide/DuckDB worker |
| **Phase 9** | **Projects Workspace & Autonomous Website/App Builder**: Project instructions/memory/files/ZIP export; multi-file React/TS app builder with isolated preview sandbox, dependency allowlist, live error diagnostics & repair loop, checkpoints/rollback, and confirmed deployment hooks. | `archiver`, `@uiw/react-codemirror` (or Monaco), isolated sandbox runner |
| **Phase 10** | **Usage Dashboard, Billing Readiness & Admin Console**: Token/image/audio cost analytics, user management, provider availability & rate-limit configuration, health monitoring, error logs, real payment hooks (only when Stripe credentials are supplied). | Express admin endpoints |
| **Phase 11** | **Quality Evaluation Framework, Security Audit & Automated Tests**: Benchmark datasets, citation/build/streaming evaluators, security regression tests (XSS, SSRF, path traversal, authz), and performance profiling. | `node --test` / `vitest` |
| **Phase 12** | **Production Readiness & Deployment**: `npm run build` verification, environment & ops documentation, backup/retention checklist, final end-to-end acceptance verification. | Production build & `server.ts` start |

---

## 7. Immediate Pre-Phase-1 Decision & Readiness Notes
1. **Database Choice for Phase 2**: Confirm provisioning **Cloud SQL (PostgreSQL)** via the built-in `cloudsql-setup` integration when moving into Phase 2.
2. **Legacy Reference Assets**: During Phase 1/2 cleanup, remove `/public/assets/aistudio/` (especially `.env_4aff258f`) from the served `public/` folder so no reference credentials or legacy files are exposed statically.
3. **Paid Model Keys**: Gemini Image (`gemini-3.1-flash-lite-image`, `gemini-nano-banana-2.1`) and Pro/Carbon (`gemini-4-neon`, `gemini-4-carbon`) require a billing-enabled API key via AI Studio's paid key selector (`paid_model_flow`) when activated in Phases 3 and 5.
