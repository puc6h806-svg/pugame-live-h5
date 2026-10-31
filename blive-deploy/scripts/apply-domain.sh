#!/usr/bin/env bash
# Apply production domain into Caddy/nginx configs from templates.
# Usage: DOMAIN=plugin.example.com bash scripts/apply-domain.sh
# Does NOT modify blive-h5-backend/.env (set ALLOWED_ORIGINS yourself after domain is confirmed).
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${DOMAIN:-}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: DOMAIN=plugin.example.com bash $0" >&2
  echo "DOMAIN must be an FQDN with no scheme or path (e.g. plugin.example.com)." >&2
  exit 1
fi

# Reject scheme/path/whitespace
if [[ "$DOMAIN" == *"/"* ]] || [[ "$DOMAIN" == *":"* ]] || [[ "$DOMAIN" == *" "* ]] \
  || [[ "$DOMAIN" == http* ]] || [[ "$DOMAIN" == .* ]] || [[ "$DOMAIN" != *.* ]]; then
  echo "Invalid DOMAIN='$DOMAIN' — use bare FQDN only, e.g. plugin.example.com" >&2
  exit 1
fi

CADDY_TPL="$DEPLOY/Caddyfile.prod.template"
NGINX_TPL="$DEPLOY/nginx/nginx.prod.conf.template"
CADDY_OUT="$DEPLOY/Caddyfile.prod"
NGINX_OUT="$DEPLOY/nginx/nginx.prod.conf"

if [[ ! -f "$CADDY_TPL" ]] || [[ ! -f "$NGINX_TPL" ]]; then
  echo "Missing templates under $DEPLOY" >&2
  exit 1
fi

sed "s/__DOMAIN__/${DOMAIN}/g" "$CADDY_TPL" > "$CADDY_OUT"
sed "s/__DOMAIN__/${DOMAIN}/g" "$NGINX_TPL" > "$NGINX_OUT"

echo "[apply-domain] wrote $CADDY_OUT"
echo "[apply-domain] wrote $NGINX_OUT"
echo
echo "=== Backend CORS (paste into blive-h5-backend/.env — do not commit) ==="
echo "ALLOWED_ORIGINS=https://${DOMAIN}"
echo
echo "=== DNS checklist ==="
echo "1. Point ${DOMAIN} A (and optionally AAAA) to this host's public IP,"
echo "   OR CNAME to your VPS / Cloudflare hostname."
echo "2. Open inbound TCP 80 and 443 on the host (and any cloud security group)."
echo "3. Certificates:"
echo "   - Caddy (auto HTTPS):"
echo "       caddy run --config ${CADDY_OUT}"
echo "   - nginx + Let’s Encrypt:"
echo "       certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}"
echo "       # or: certbot --nginx -d ${DOMAIN}"
echo "       nginx -c ${NGINX_OUT}"
echo "4. Open-platform publish URL: https://${DOMAIN}/"
echo "5. After DNS+TLS work: restart backend with ALLOWED_ORIGINS set; smoke-test embed headers."
echo
echo "[apply-domain] Done. Templates unchanged; generated files are gitignored."
