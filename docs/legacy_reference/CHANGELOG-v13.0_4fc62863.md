# NexusAI v13.0

## Fixes
- Added an idempotent v6 database migration for `memory_candidates`, `agent_tasks`, `agent_task_steps`, and `conversation_summaries`.
- Fixed Website Builder's missing `snapshotProject` implementation, which caused generation/edit requests to fail when snapshotting.
- Added conservative CPU-only Ollama inference defaults (`OLLAMA_NUM_GPU=0`) and smaller context/output defaults for low-memory laptops.
- Current/live questions now trigger a web-search attempt automatically; if search is unavailable, the system prompt explicitly forbids presenting historical guesses as current facts.
- Updated `.env.example` with the tested small model name and DuckDuckGo search option.

## Apply after upgrading
1. Back up the existing `nexus_ai` database and workspace folder.
2. Copy `.env` from the existing project; do not replace it with `.env.example`.
3. Set `OLLAMA_MODEL=qwen2.5-coder:1.5b`, `OLLAMA_NUM_GPU=0`, `AI_NUM_CTX=2048`, and `AI_NUM_PREDICT=512` in `.env`.
4. Set `SEARCH_PROVIDER=duckduckgo` if outbound web access is allowed.
5. Run `npm run migrate:v6`.
6. Restart with `npm start`.

The small local model is resource-compatible, not ChatGPT-equivalent. Website generation and agent quality remain limited by model capability and available RAM.
