# NexusAI v5.0

## Added
- Coordinator-led specialist workflow with plan validation, dependency DAG ordering, role-specific model overrides, specialist input refinement and independent evidence review.
- Model smoke evaluation API and CLI benchmark.
- Rolling conversation summaries for long chats, stored in MySQL.
- Hybrid memory ranking combining embeddings, keyword overlap and recency.
- Transactional website project replacement and retained rollback snapshots.
- Localhost-only API network boundary and same-origin checks for mutating requests.
- Configurable specialist model IDs and OpenAI-compatible model selector list.

## Important limitations
- This is an independent implementation based on public engineering patterns; no private ChatGPT training data, weights, source code or internal architecture are included.
- Specialist roles are separate model calls but share the selected provider unless role-specific model IDs are configured. They are not independent deployed agents.
- Browser automation, secure code execution, account authentication/per-user isolation, background task resumption, true realtime voice and full end-to-end tests remain incomplete.
- Benchmark is a small smoke test, not a capability or safety certification.
