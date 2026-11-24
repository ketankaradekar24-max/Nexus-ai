# NexusAI v3.0 changes

## Agent workspace
- Added a dedicated Agent Workspace screen.
- Expanded the allowlisted agent tools to web search, calculator, project listing, project file listing/reading, website generation and website editing.
- Added strict input bounds, action allowlisting, planner JSON parsing, step caps, cancellation propagation, provider timeouts and action-level error capture.
- Added honest completion metadata and partial-result reporting when the agent reaches its step limit.
- Website generation/editing reuses the same validated project builder and workspace path protections as the regular builder routes.

## Provider reliability
- OpenAI-compatible generation now accepts generation options and uses a configurable timeout while keeping API keys server-side.

## Tests
- Added planner JSON and action allowlist tests.

## Still not delivered
- Authentication and user isolation, secure code execution, voice, scanned-PDF OCR, automatic memory extraction/approval, multi-agent orchestration, browser automation and full integration testing remain unfinished. Do not deploy publicly.
- Added browser-native voice dictation and speech playback when supported by the user's browser. These use browser speech services; availability, language quality and privacy behavior depend on the browser/device.
- Added browser-native voice dictation and read-aloud controls where supported by the browser.
- Added scanned-PDF OCR through optional local Poppler `pdftoppm` plus Tesseract, with 20 MB and first-10-page limits and temporary-file cleanup.
