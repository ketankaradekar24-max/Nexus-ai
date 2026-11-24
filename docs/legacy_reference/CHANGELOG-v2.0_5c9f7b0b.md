# NexusAI v2.0 changes

## Integrated in this build
- Mounted the bounded agent API at `/api/agent/run`.
- Mounted the image OCR API at `/api/ocr/:id` (requires Tesseract installed locally).
- Added the missing `archiver` dependency required by project ZIP export.
- Documented project editing, file listing, download, agent and OCR endpoints.
- Updated project metadata and documented actual implementation limits and local-only deployment posture.

## Verification performed in the build environment
- `node scripts/check.js`: passed; 27 JavaScript files syntax-checked.
- `node --test`: passed; 3 tests.

## Not verified here
- MySQL connection using your local credentials.
- Ollama availability, model download, inference quality or GPU offload on your ASUS laptop.
- External web-search provider availability.
- Tesseract OCR installation and accuracy.
- Browser end-to-end behavior, website generation quality, ZIP download in the running app, load/security testing.

## Still pending
- User accounts, authentication, per-user authorization and CSRF protection.
- Fully automatic memory extraction with user review/approval and memory governance.
- General multi-tool agent with robust planning, retries, task checkpoints and audit trail.
- Sandboxed code execution (currently disabled intentionally).
- Scanned-PDF rasterization and OCR.
- Voice input/output.
- Browser automation and production deployment hardening.
