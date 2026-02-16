#!/usr/bin/env bash
set -euo pipefail

BACKEND_PID_FILE="/tmp/buildwise-v2-backend.pid"
FRONTEND_PID_FILE="/tmp/buildwise-v2-frontend.pid"

stop_by_pid_file() {
  local file="$1"
  local name="$2"
  if [[ ! -f "$file" ]]; then
    echo "[stack] $name pid file not found"
    return
  fi
  local pid
  pid="$(cat "$file")"
  if ps -p "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    echo "[stack] stopped $name pid=$pid"
  else
    echo "[stack] $name pid=$pid not running"
  fi
  rm -f "$file"
}

stop_by_pid_file "$BACKEND_PID_FILE" "backend"
stop_by_pid_file "$FRONTEND_PID_FILE" "frontend"

