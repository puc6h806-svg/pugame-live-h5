#!/usr/bin/env bash
# Build frontend + backend (no secrets printed)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FE="${ROOT}/bilibili-live-h5-plugin"
BE="${ROOT}/blive-h5-backend"

echo "[build] frontend → ${FE}"
(cd "$FE" && npm run build)

echo "[build] backend → ${BE}"
(cd "$BE" && npm run build)

echo "[build] done"
