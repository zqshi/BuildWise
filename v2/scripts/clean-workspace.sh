#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "[clean] removing frontend dist and vite cache"
rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/node_modules/.vite" "$ROOT_DIR/.artifacts" "$ROOT_DIR/index" "$ROOT_DIR/memory" "$ROOT_DIR/shards" "$ROOT_DIR/workspace.json" "$ROOT_DIR/.buildwise" "$ROOT_DIR/tmp/e2e-reports"

echo "[clean] removing backend dist and runtime data"
rm -rf "$BACKEND_DIR/dist" "$BACKEND_DIR/data.runtime.json"

echo "[clean] done"
