# Android (Capacitor) & Production Deployment Guide

## Production Web Deployment (Cloud Run / Node.js)

1. Build the Vite frontend bundle:
   ```bash
   npm run build
   ```
2. Provide production environment variables (never commit `.env`):
   - `NODE_ENV=production`
   - `PORT=3000`
   - `GEMINI_API_KEY=...`
   - `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`
   - `KEY_ENCRYPTION_SECRET` (minimum 32 random characters)
   - `APP_URL=https://your-production-domain.example`
3. Start the Express server:
   ```bash
   npm start
   ```
   Verify `/api/health` returns `200 OK`.

## Android Mobile Packaging (Capacitor)

`capacitor.config.ts` at the repository root configures the Android WebView shell (`appId: "ai.subai.workspace"`, `appName: "SUB AI"`, `webDir: "dist"`).

To generate and build the Android native project locally on a workstation with Android Studio / Android SDK installed:

```bash
# 1. Install Capacitor CLI & Android platform locally
npm install @capacitor/core @capacitor/cli @capacitor/android

# 2. Build the production web bundle
npm run build

# 3. Initialize/sync Android native project from capacitor.config.ts
npx cap add android
npx cap sync android

# 4. Open in Android Studio to sign APK/AAB and configure Firebase Google Sign-In SHA-1/SHA-256
npx cap open android
```

### Android Runtime Notes
- Configure your production backend URL (`APP_URL`) or reverse proxy so API (`/api/*`) and live voice WebSocket (`/ws/live`) traffic routes over `https://` / `wss://`.
- Add `android.permission.RECORD_AUDIO` in `android/app/src/main/AndroidManifest.xml` for Voice Studio microphone capture.
- Add your Android debug/release SHA-1 and SHA-256 fingerprints in Firebase Console so Google Sign-In works cleanly inside the native shell.
