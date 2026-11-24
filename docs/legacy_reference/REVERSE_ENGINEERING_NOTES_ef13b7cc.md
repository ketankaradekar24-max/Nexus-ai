# NexusAI reverse-engineering notes (public engineering patterns)

This project studies observable AI-assistant capabilities and independently implements common public engineering patterns. It does not contain or reproduce OpenAI's private source code, model weights, training data, hidden prompts, or internal infrastructure.

## Architecture patterns used

1. **Model-agnostic inference adapters** — keep provider-specific HTTP details behind a common generate/stream interface. Provider/model quality is an external dependency.
2. **Task-aware routing** — classify requests and choose a configured model; explicit user choice overrides heuristics.
3. **Retrieval-augmented context** — retrieve relevant saved memory and attach document/web evidence as untrusted context. Retrieval quality depends on embedding and ranking quality.
4. **Conversation compression** — summarize older turns while retaining a recent-message window. Summaries are lossy and must never override newer explicit messages.
5. **Tool-using agents** — separate planning from allowlisted tool execution. Tool results, not the model's claims, are the evidence of completed actions.
6. **Plan/dependency execution** — validate task IDs, dependency edges and cycles before running tasks in dependency order.
7. **Independent review** — use a separate review prompt to check the final result against recorded evidence. A model reviewer is still probabilistic, not a formal proof.
8. **Safety boundaries** — constrain tools, validate paths, limit task count and keep the server local-only until real authentication, ownership and sandboxing exist.
9. **Evaluation** — run repeatable smoke tests and record latency/results. A tiny benchmark is not a scientific capability ranking; build a larger curated evaluation set before comparing models.

## Important distinction

These are public, general-purpose software architecture techniques. They are not claims about ChatGPT's private implementation. Do not treat this repository as a ChatGPT clone or assume that adding these patterns makes a small local model equivalent to a frontier model.
