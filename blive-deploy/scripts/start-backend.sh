#!/usr/bin/env bash
# Start backend with dotenv from blive-h5-backend/.env (never echo secrets)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BE="${ROOT}/blive-h5-backend"
cd "$BE"

if [[ ! -f .env ]]; then
  echo "[backend] missing .env — copy .env.example and fill keys (do not commit)" >&2
  exit 1
fi

if [[ ! -f dist/index.js ]]; then
  echo "[backend] dist missing — npm run build first" >&2
  exit 1
fi

export NODE_ENV="${NODE_ENV:-production}"
# dotenv loads .env from cwd inside the app; do not source .env here (avoids shell history leaks)
echo "[backend] starting node dist/index.js (PORT from .env / env; secrets not printed)"
exec node dist/index.js
