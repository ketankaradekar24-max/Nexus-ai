# NexusAI v7.0.0

- Added file signature validation for PDF, DOCX, PNG, JPEG and WEBP uploads.
- Added text/control-byte checks and JSON parsing validation for text uploads.
- Sanitized displayed upload filenames and bounded upload size configuration.
- Added cleanup and database-row rollback for failed multi-file ingestion.
- Added explicit file deletion endpoint with storage cleanup.
- Bounded agent step/task counts to prevent unbounded client-supplied execution budgets.
- Added regression tests for upload validation and filename sanitization.

Security boundary remains localhost-only. This is not multi-user authentication or a production sandbox.
