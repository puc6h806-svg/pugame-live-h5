#!/usr/bin/env bash
# Start Node edge on EDGE_PORT (default 8080)
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
export EDGE_PORT="${EDGE_PORT:-8080}"
export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8787}"
export STATIC_ROOT="${STATIC_ROOT:-$DEPLOY/current}"
cd "$DEPLOY"
if [[ ! -e current/index.html ]]; then
  echo "[edge] current/ empty — run scripts/release.sh first" >&2
  exit 1
fi
echo "[edge] STATIC_ROOT=${STATIC_ROOT} BACKEND_URL=${BACKEND_URL} PORT=${EDGE_PORT}"
exec node serve-prod.mjs
