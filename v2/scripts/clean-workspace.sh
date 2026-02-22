#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "[clean] removing frontend dist and vite cache"
rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/node_modules/.vite"

echo "[clean] removing backend dist and runtime data"
rm -rf "$BACKEND_DIR/dist" "$BACKEND_DIR/data.runtime.json"

echo "[clean] done"
