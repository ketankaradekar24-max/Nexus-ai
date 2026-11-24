# SUB AI Security Architecture & Threat Model

## 1. Authentication & Session Handling
- Every authenticated API endpoint (`/api/*` except `/api/health` and read-only `/api/shared/:token`) enforces Firebase ID token verification via `firebase-admin` in `src/middleware/auth.ts`.
- WebSocket connections to `/ws/live` verify Firebase ID tokens prior to opening upstream Gemini Live sessions.
- ID tokens remain strictly in React memory (`AuthContext`) and are never written to `localStorage` or `sessionStorage`.

## 2. Credential Protection & BYOK Encryption
- `GEMINI_API_KEY` and server-side provider keys are never exposed to client bundles or returned by any API endpoint.
- User-supplied third-party provider keys (OpenAI, Anthropic, xAI) are encrypted at rest in PostgreSQL (`user_api_keys`) using AES-256-GCM (`server/utils/crypto.ts`) with per-record 12-byte random IVs and authentication tags.
- Only masked key hints (e.g., `sk-a...9f21`) are returned to the frontend.

## 3. SSRF, Path Traversal & Archive Safety
- External URL fetching in Research (`server/routes/research.ts`) and BYOK base URLs (`server/routes/account.ts`) pass `assertSafeExternalUrl` (`server/utils/security.ts`), which blocks non-HTTP(S) schemes, `localhost`, `.local`, `metadata.google.internal`, and resolved private/loopback/link-local IPv4 & IPv6 ranges (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`).
- Local file writes and reads in `uploads` and `images` routes pass `resolveSafePath`, preventing directory traversal outside confined storage directories.
- XLSX and PPTX parsing avoids vulnerable legacy SheetJS (`xlsx`) APIs and instead parses XML inside `jszip` with a strict `35MB` uncompressed byte cap (`MAX_ZIP_UNCOMPRESSED_BYTES`) to mitigate ZIP bombs.

## 4. Injection & Sandbox Isolation
- **SQL**: All database queries use Drizzle ORM parameterized queries (`src/db/`).
- **XSS**: Markdown code highlighting uses `DOMParser` -> React token tree mapping (`src/components/MarkdownRenderer.tsx`) rather than raw `dangerouslySetInnerHTML`.
- **CSV Formula Injection**: Exported CSV cells pass `sanitizeCsvCell`, neutralizing leading `=`, `+`, `-`, `@`, `\t`, and `\r`.
- **App Builder & Data Lab**: Generated web apps compile in an isolated virtual `esbuild` environment with secret-leakage scanning and render inside an `<iframe sandbox="allow-scripts">` container without `allow-same-origin`. Data Lab transformations execute inside an isolated browser `Worker` with a 1500ms termination timeout.
- **HTTP Hardening**: `helmet` security headers (with iframe embedding permitted for AI Studio preview via `frameguard: false`) and `express-rate-limit` on `/api/*`.
