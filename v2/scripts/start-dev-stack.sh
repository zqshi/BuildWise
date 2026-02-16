#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PID_FILE="/tmp/buildwise-v2-backend.pid"
FRONTEND_PID_FILE="/tmp/buildwise-v2-frontend.pid"
BACKEND_LOG="/tmp/buildwise-v2-backend.log"
FRONTEND_LOG="/tmp/buildwise-v2-frontend.log"

start_backend() {
  if lsof -i :5055 >/dev/null 2>&1; then
    echo "[stack] backend already running on :5055"
    return
  fi
  echo "[stack] starting backend on :5055 ..."
  nohup npm --prefix "$ROOT_DIR/backend" run start >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"
}

start_frontend() {
  if lsof -i :5173 >/dev/null 2>&1; then
    echo "[stack] frontend already running on :5173"
    return
  fi
  echo "[stack] starting frontend on :5173 ..."
  nohup npm --prefix "$ROOT_DIR" run dev -- --host 127.0.0.1 --port 5173 >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"
}

start_backend
start_frontend

echo "[stack] done"
echo "[stack] backend log: $BACKEND_LOG"
echo "[stack] frontend log: $FRONTEND_LOG"

