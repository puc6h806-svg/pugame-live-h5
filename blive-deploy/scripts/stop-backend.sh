#!/usr/bin/env bash
# Stop process listening on backend port (default 8787)
set -euo pipefail
PORT="${PORT:-8787}"
PIDS="$(ss -tlnp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print}' | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
if [[ -z "$PIDS" ]]; then
  echo "[backend] nothing listening on :${PORT}"
  exit 0
fi
echo "[backend] stopping PIDs on :${PORT}: $PIDS"
# shellcheck disable=SC2086
kill $PIDS 2>/dev/null || true
sleep 1
PIDS2="$(ss -tlnp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print}' | grep -oP 'pid=\K[0-9]+' | sort -u || true)"
if [[ -n "$PIDS2" ]]; then
  kill -9 $PIDS2 2>/dev/null || true
fi
echo "[backend] stopped"
