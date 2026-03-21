# Prepare Application

Setup the application for review or test.

## Variables

PORT: from `.ports.env` (FRONTEND_PORT) if it exists, otherwise 5173

## Setup

- Check if `.ports.env` exists in the project root. If it does, read `FRONTEND_PORT` from it and use that as the PORT. Otherwise use 5173.
- IMPORTANT: Start the SvelteKit dev server in the background: `nohup bun run dev --port $PORT > /dev/null 2>&1 &`
- Wait a few seconds for the dev server to start, then verify it's running by checking `curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT`
- Note: This project uses Convex (hosted backend) — no local database setup is needed.
- The application URL will be `http://localhost:$PORT`