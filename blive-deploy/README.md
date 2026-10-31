# blive-deploy

Shared edge + release tooling for bilibili-live H5 plugin.

- `serve-prod.mjs` — Node edge (:8080): static `current/` + proxy `/api` `/ws` → `:8787` + embed headers
- `Caddyfile` / `nginx/nginx.conf` — same layout for real TLS hosts
- `scripts/` — build, release, rollback, start-backend, start-edge, tunnel
- `DEPLOY.md` — Chinese deploy guide

```bash
bash scripts/build.sh && bash scripts/release.sh
bash scripts/start-edge.sh   # :8080
# optional: bash scripts/tunnel.sh
```
