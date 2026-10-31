#!/usr/bin/env bash
# Cloudflare quick tunnel → local edge (no account for trycloudflare.com)
# Box egress may block argotunnel QUIC/7844; --protocol http2 is tried first.
set -euo pipefail
EDGE_PORT="${EDGE_PORT:-8080}"
TARGET="http://127.0.0.1:${EDGE_PORT}"
PROTO="${TUNNEL_PROTOCOL:-http2}"
echo "[tunnel] cloudflared quick tunnel → ${TARGET} (protocol=${PROTO})"
echo "[tunnel] temporary URL; for stable HTTPS use named tunnel + your domain"
echo "[tunnel] if TLS/QUIC to edge fails, this box cannot host a public tunnel — use your VPS/domain"
exec cloudflared tunnel --url "$TARGET" --protocol "$PROTO" --no-autoupdate
