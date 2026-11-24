# NexusAI v12.0

## Intelligence and agent-quality update

- Added task- and complexity-aware response guidance.
- Improved routing for research, coding, reasoning and vision prompts.
- Added configurable Ollama sampling and output-token controls.
- Strengthened agent planning, tool-failure recovery and evidence-based completion review.
- Added AI provider/model diagnostic command and `/api/intelligence/status`.
- Added regression tests for the intelligence profile and intent routing.

## Validation boundaries

This release does not train or fine-tune model weights. Local MySQL, Ollama, web search, vision and browser workflows must be tested on the user's machine. A passing unit suite does not prove every integration works.
