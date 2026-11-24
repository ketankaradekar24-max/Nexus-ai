# NexusAI v15.0 — Windows upgrade

## Before replacing the old folder

1. Stop the currently running NexusAI server with `Ctrl+C` in its terminal.
2. Back up your existing `workspace` folder and MySQL database `nexus_ai`.
3. Keep a private backup of your current `.env`. Never upload or share it.

## Install

1. Extract `nexus-ai-v15.0.zip`.
2. Open the extracted `nexus-ai-v15` folder in VS Code (the folder containing `package.json` and `server.js`).
3. Copy your existing `.env` into this folder. If you do not have one, copy `.env.example` to `.env` and fill in your database credentials.
4. Open the VS Code terminal in this exact folder and run:

```powershell
npm install
npm run check
npm test
npm run db:check
npm run intelligence:check
npm start
```

5. Open `http://localhost:3000`.

Do not run `npm audit fix --force`. If `npm start` reports that port 3000 is already in use, stop the other NexusAI process before starting another one.

## New features

- Mobile workspace navigation: Chat, Projects, Code and Artifacts.
- Code generation with the configured model and static validation. It does not execute code.
- Artifacts aggregates website projects and generated images from the local workspace.
- Optional live cricket fixtures/scores via API-Sports Cricket. Add a valid `CRICKET_API_KEY` to `.env`, optionally set `CRICKET_API_BASE_URL`, then restart the server. Provider plan and API coverage determine which matches are returned.

## Important

The archive does not contain your `.env`, database, model weights, `node_modules`, or existing workspace files. Preserve and restore your own data. Live cricket requires an API key. The UI and local tests do not prove that an external provider account is active.
