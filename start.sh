#!/usr/bin/env bash
# Start both backend and frontend dev servers.

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "▶  Starting backend on http://localhost:8000"
(
  cd "$ROOT/backend"
  source .venv/bin/activate
  uvicorn main:app --reload --port 8000
) &
BACKEND_PID=$!

echo "▶  Starting frontend on http://localhost:5173"
(
  cd "$ROOT/frontend"
  npm run dev
) &
FRONTEND_PID=$!

# Clean up both processes on Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
