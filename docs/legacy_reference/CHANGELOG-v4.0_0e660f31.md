# NexusAI v4.0 — intelligence and continuity foundation

## Added
- Task-aware model routing with per-task model overrides (`MODEL_GENERAL`, `MODEL_CODING`, `MODEL_REASONING`, `MODEL_VISION`) and installed-model fallback for Ollama.
- Chat model list reports provider and automatic-routing capability; the UI default now clearly means automatic selection. A manually selected model still takes precedence.
- Automatic memory candidate extraction after successful assistant replies. Candidate extraction is bounded and filters obvious secrets; suggestions remain pending until user approval.
- Memory candidate review API and UI: list, approve, reject. Approval is the only path that turns a suggestion into saved memory.
- Persistent agent task records and step logs in MySQL, with task list/detail endpoints and explicit `needs_review` status when the bounded agent cannot verify completion.
- Agent run now records each action checkpoint and final task outcome.
- Added an independent completion-review call; a planner cannot mark a task complete unless the reviewer returns a strict verified result. Ambiguous or failed reviews become `needs_review`.
- Added schema migration `schema-v4.sql` for the new memory and task tables.

## Safety and limitations
- Automatic memory extraction is probabilistic. The user must review every suggestion; the filter is not a guarantee that every sensitive fact is detected.
- Task model routing is heuristic, not an intelligence benchmark. Manual model selection overrides it.
- Agent tasks currently execute in the request lifecycle. Checkpoints survive server restarts, but automatic background resumption/replay is not implemented.
- This release does not add multi-agent collaboration, browser automation, production authentication, per-user data isolation, or a secure code execution sandbox.
- Never expose this localhost-only app publicly. Do not enable code execution without a real OS/container isolation boundary.
