# NexusAI v10.0

## Database connection diagnosis and setup reliability
- Load the project-root `.env` explicitly so launching from another working directory cannot silently select a different/missing env file.
- Add `npm run db:check` for a safe MySQL connection test, account identity inspection, schema table listing, and targeted recovery instructions for access-denied, refused-connection, and missing-database errors.
- Expose only the MySQL error code from `/api/health`; never return credentials or raw connection details.
- Show the database error code in the UI connection detail when MySQL is offline.

## Important
This release cannot infer or recover a user's MySQL password. The user must reset the `nexus_app` account in MySQL Workbench and set the same password in the actual project-root `.env`. MySQL/Ollama live integration must be tested on the user's machine.
