# 哔哩哔哩直播 H5 插件 — HTTPS 部署说明

## 官方要求（开放平台）

1. **发布 URL 必须是 HTTPS**（直播姬 / 饭贩才能安全加载）。
2. 页面须可被 `https://play-live.bilibili.com/` **iframe 嵌入**。响应头建议同时带：
   - `X-Frame-Options: ALLOW-FROM https://play-live.bilibili.com/`
   - `Content-Security-Policy: frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'`
3. **禁止**设置 `X-Frame-Options: DENY`（或会挡住嵌入的 `SAMEORIGIN`）。

本仓库 edge（Caddy / nginx / `serve-prod.mjs`）已按上述写入响应头。生产采用 **同源**：H5 与 `/api`、`/ws` 同域，前端可保持 `VITE_API_BASE` / `VITE_WS_URL` 为空。

## 目录

| 路径 | 说明 |
|------|------|
| `/workspace/bilibili-live-h5-plugin` | 前端（Vue/Vite，`dist/`） |
| `/workspace/blive-h5-backend` | 后端（Express+WS，默认 `:8787`） |
| `/workspace/blive-deploy` | 边缘网关、发布脚本、本说明 |

## 推荐方案（有域名）

1. 用户自有域名 DNS → 服务器（或 Cloudflare 代理）。
2. 用 **Caddy**（自动 HTTPS）或 **nginx + 证书**：
   - 静态根：`blive-deploy/current`（`release.sh` 原子切换）
   - `/api`、`/ws` 反代 `127.0.0.1:8787`
3. 后端仅本机监听；密钥只在 `.env` / 进程环境变量。

```bash
# 构建 + 发布前端产物
bash /workspace/blive-deploy/scripts/build.sh
bash /workspace/blive-deploy/scripts/release.sh

# 后端（在 blive-h5-backend，读本地 .env，脚本不打印密钥）
bash /workspace/blive-deploy/scripts/start-backend.sh

# 边缘：二选一
# A) Node（已实现，适合本机 / Tunnel 前）
EDGE_PORT=8080 bash /workspace/blive-deploy/scripts/start-edge.sh
# B) Caddy
caddy run --config /workspace/blive-deploy/Caddyfile
# C) nginx
# nginx -c /workspace/blive-deploy/nginx/nginx.conf
```

回滚：

```bash
bash /workspace/blive-deploy/scripts/rollback.sh
# 按需重启 edge
```

## 本机 box 无公网域名时（临时）

当前共享 box **没有**绑定的公网域名。临时可用 **Cloudflare Quick Tunnel**（`trycloudflare.com`，无需登录；URL 每次变化、仅调试）：

```bash
# 终端 1：后端已在 :8787 则可跳过
bash /workspace/blive-deploy/scripts/start-backend.sh

# 终端 2：边缘 :8080
bash /workspace/blive-deploy/scripts/release.sh   # 若尚未发布
bash /workspace/blive-deploy/scripts/start-edge.sh

# 终端 3：公网 HTTPS
bash /workspace/blive-deploy/scripts/tunnel.sh
# cloudflared 日志里会出现 https://xxxx.trycloudflare.com
```

稳定生产请改用：**用户域名 + Caddy/nginx TLS**，或 **Cloudflare Named Tunnel**（需用户 Cloudflare 账号登录 / tunnel token，本环境不代填凭证）。

## CORS：`ALLOWED_ORIGINS`

后端 `.env` 中 `ALLOWED_ORIGINS` 为逗号分隔源列表。开发留空 = 允许全部（当前状态）。

生产请设为 **H5 插件的 HTTPS 源**（与浏览器地址栏同源，无路径），例如：

```text
ALLOWED_ORIGINS=https://plugin.example.com
```

若用 quick tunnel：

```text
ALLOWED_ORIGINS=https://xxxx.trycloudflare.com
```

同源部署时浏览器对 `/api` 仍是同源请求；收紧 CORS 可防其它站点滥用 API。改完后重启后端。

## 密钥

- 仅通过 `blive-h5-backend/.env` 或进程环境变量注入。
- **禁止**写入 git、聊天、脚本 echo、日志。
- 所需键见 `.env.example`：`BILI_*`、`SESSION_SECRET`、`PORT`、`ALLOWED_ORIGINS`。
- 前端生产构建保持 `VITE_API_BASE=`、`VITE_WS_URL=`（空 = 同源）。

## 发布检查清单

1. `build.sh` → `release.sh`，确认 `blive-deploy/current/index.html` 存在。
2. 后端 health：`curl -s http://127.0.0.1:8787/api/health` → `{"ok":true}`。
3. 边缘头：`curl -sI http://127.0.0.1:8080/` 含 `X-Frame-Options: ALLOW-FROM …` 与 `Content-Security-Policy: frame-ancestors …`。
4. HTTPS URL 填入开放平台「发布地址」；`ALLOWED_ORIGINS` 同步为该源。
5. 在直播姬 / 饭贩中打开插件页，确认 iframe 无拒绝嵌入。

## 阻塞项（需用户提供）

| 缺什么 | 用途 |
|--------|------|
| 自有域名 + DNS | 稳定 HTTPS、开放平台长期发布 URL |
| Cloudflare 账号 / Named Tunnel token（可选） | 固定隧道子域，免公网 IP |
| 服务器是否已对公网 443 开放 | Caddy/nginx 直出 TLS 时需要 |

Quick Tunnel 仅作联调；**正式上架请换固定 HTTPS 域名**。

## 本机实测阻塞（2026-10-31）

- 已安装 `cloudflared` / `caddy`，本地边缘 `http://127.0.0.1:8080` **可用**（静态 + `/api` 反代 + iframe 头齐全）。
- Quick Tunnel 能申请到 `https://*.trycloudflare.com` 主机名，但 **无法与 Cloudflare edge 建连**：
  - QUIC / UDP 7844：FAIL
  - HTTP/2 到 argotunnel edge：TLS handshake EOF
- 因此 **当前 box 上没有可用的公网 HTTPS URL**。开放平台发布地址需用户提供：
  1. 自有域名 + 可出网的主机（Caddy/nginx TLS），或
  2. 在用户本机/VPS 跑 `cloudflared`（Named Tunnel 需 Cloudflare 登录 / token），反代到本服务，或
  3. 把前后端部署到已有 HTTPS 的云主机。

本地联调不受影响：浏览器/直播姬开发机可临时用 SSH 端口转发访问 `:8080`。

## 生产域名 TLS

上线前先填 [DOMAIN-CHECKLIST.md](./DOMAIN-CHECKLIST.md)（FQDN、DNS 指向、证书方式、是否同源）。

域名确认后生成生产配置（**不会**自动改后端 `.env`）：

```bash
DOMAIN=plugin.example.com bash /workspace/blive-deploy/scripts/apply-domain.sh
# 输出里会打印应写入 .env 的一行：ALLOWED_ORIGINS=https://plugin.example.com
```

- 模板：`Caddyfile.prod.template`、`nginx/nginx.prod.conf.template`（占位符 `__DOMAIN__`）
- 生成物（已 gitignore）：`Caddyfile.prod`、`nginx/nginx.prod.conf`
- 跑边缘：`caddy run --config /workspace/blive-deploy/Caddyfile.prod`，或 certbot 后 `nginx -c /workspace/blive-deploy/nginx/nginx.prod.conf`

## GitHub → Cloudflare 同步发布（pugame.site）

用户域名已定为 **`pugame.site`**，同源（H5 + `/api` + `/ws`）已确认。详见：

- [github/GITHUB-DEPLOY.md](./github/GITHUB-DEPLOY.md) — Actions / Pages / Worker 模板与密钥清单
- 模板目录：`github/workflows/`、`github/cloudflare/`

**当前 apex 阻塞**：`https://pugame.site` 探测为 Cloudflare **403** 且响应头含 **`X-Frame-Options: SAMEORIGIN`**，会挡住 bilibili iframe。生产必须用 Pages `_headers`、Worker 或 Transform Rules 改为 `ALLOW-FROM https://play-live.bilibili.com/` + CSP `frame-ancestors`（切勿保留 DENY/SAMEORIGIN）。`www.pugame.site` 目前是另一套 EdgeOne 页面，与 apex 是否统一需用户确认。

备选单机 TLS：已执行 `DOMAIN=pugame.site bash scripts/apply-domain.sh` → `Caddyfile.prod` / `nginx/nginx.prod.conf`。后端生产应设 `ALLOWED_ORIGINS=https://pugame.site`（勿提交）。
