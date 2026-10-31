# pugame-live-h5

哔哩哔哩直播姬 / 饭贩 **H5 互动插件** monorepo（前端 + 后端 + 部署脚手架）。

**发布 URL（开放平台填写）：** `https://pugame.site/`

目标：HTTPS 同源部署 — 静态 H5、`/api`、`/ws` 均在 `https://pugame.site` 下，可被 `https://play-live.bilibili.com/` iframe 安全嵌入。

---

## 仓库结构

| 路径 | 说明 |
|------|------|
| `bilibili-live-h5-plugin/` | 前端（Vue / Vite） |
| `blive-h5-backend/` | 后端（Express + WebSocket，默认 `:8787`） |
| `blive-deploy/` | 本机 / VPS 边缘（Caddy / nginx / 发布脚本） |
| `cloudflare/` | Pages `_headers` / `_redirects` + 同源 Worker |
| `functions/` | Pages Functions：`/api`、`/ws` 反代（必须是真实目录，不能是 symlink） |
| `.github/workflows/deploy-pages.yml` | push `main` → 构建前端 → Cloudflare Pages（含 Functions） |
| `.github/workflows/deploy-worker.yml` | 部署 Worker `pugame-same-origin`（无 zone 路由） |

---

## 开放平台硬性要求

1. 发布地址必须是 **HTTPS**。
2. 响应头须允许直播姬嵌入，建议同时带：
   - `X-Frame-Options: ALLOW-FROM https://play-live.bilibili.com/`
   - `Content-Security-Policy: frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'`
3. **禁止**对插件页使用 `X-Frame-Options: DENY` 或 `SAMEORIGIN`。

本仓库 `cloudflare/_headers`、Worker 与 Caddy/nginx 模板已按上述写入。

### ⚠ 当前 apex 阻塞（务必先改）

探测时 `https://pugame.site` 曾返回 **Cloudflare 403**，且带 **`X-Frame-Options: SAMEORIGIN`** → **直播姬 / 饭贩嵌不进去**。

上线前必须：

1. 把 `cloudflare/_headers` 打进 Pages 发布根（workflow 已自动 `cp` 进 `dist/`）。
2. 用 Worker（见下）对 HTML 响应 **删除并重写** 帧头；或
3. 在 Cloudflare **Transform Rules → Modify Response Header** 覆盖掉区级 Managed Headers 注入的 `SAMEORIGIN`。

冒烟：

```bash
curl -sI https://pugame.site/ | grep -iE 'x-frame|content-security'
# 不得出现 SAMEORIGIN / DENY；应见 ALLOW-FROM 与 frame-ancestors
```

---

## CORS：`ALLOWED_ORIGINS`

后端仅通过 **宿主环境变量** / 私密 `.env` 配置（**勿提交真实密钥**）：

```text
ALLOWED_ORIGINS=https://pugame.site
```

参考：`blive-h5-backend/.env.example`（已写生产示例值；密钥字段留空）。

另需在宿主设置（值只放 secrets / 本机 `.env`，绝不进公开仓库或 Workflow 明文）：

- `BILI_ACCESS_KEY_ID` / `BILI_ACCESS_KEY_SECRET` / `BILI_APP_ID`
- `SESSION_SECRET`
- `PORT`（默认 `8787`）

---

## 推荐部署：Cloudflare Pages + Worker（同源）

仅 **GitHub Pages 静态** **不能**反代 Node 的 `/api` 与 `/ws`。同源请用：

1. **GitHub Actions** 构建前端 → **Cloudflare Pages**（项目名 `pugame-live-h5`）。
2. **Pages Functions**（仓库根真实目录 `functions/`，调用 `cloudflare/worker-same-origin.js`）在 Pages 项目里反代：
   - `/api*`、`/ws*` → `BACKEND_ORIGIN`（默认 `https://api.pugame.site`，可用项目变量覆盖；不是密钥）
   - Workers 不能 `fetch()` 裸 IP（会得到 Cloudflare **1003**）。HTTP IP 源改用 TCP socket 拨号，`Host` 设成该 IP:端口
   - 代理时会丢掉 `Host`、`cf-*`、`x-forwarded-*`，避免把 workers.dev / pages.dev 的 Host 传给上游（会 500）
   - 静态页仍由 Pages 直接吐出，嵌入头来自 `cloudflare/_headers`
3. 独立 Worker `cloudflare/worker-same-origin.js`（`deploy-worker.yml`，名字 `pugame-same-origin`）逻辑相同。**`pugame.site/*` 路由要等这个 Cloudflare 账号里有该 zone**（Add site 并把 NS 指过来）。当前账号没有 zone，不能挂 Worker Route。

### 自定义域 DNS（在注册商改，不要写进本仓库）

Pages 已添加 `pugame.site`，状态会停在 **pending / CNAME record not set**，直到注册商有这条记录：

| 类型 | 主机 | 目标 |
|------|------|------|
| CNAME；apex 不能写 CNAME 时用 ALIAS 或 ANAME | `@`（`pugame.site`） | `pugame-live-h5.pages.dev` |

校验通过后，`https://pugame.site/api` 与 `/ws` 走同一套 Pages Functions。在 zone 进这个账号之前，同源地址是 `https://pugame-live-h5.pages.dev/`（以及 CNAME 生效后的 apex）。

### GitHub Secrets（仓库 Settings → Secrets）

| Secret | 用途 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Wrangler Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 ID |

`BACKEND_ORIGIN` / `PAGES_ORIGIN` 是明文配置（写在 Worker 默认值和 workflow `env` 里，也可用 Pages / Worker 变量覆盖）。不要把 API Token 写进仓库。

### Actions 要点

- `FRONTEND_PATH=bilibili-live-h5-plugin`
- `CF_PAGES_PROJECT=pugame-live-h5`
- 构建时 `VITE_API_BASE` / `VITE_WS_URL` 留空（同源）

---

## 备选：单机 VPS + Caddy

```bash
# 在宿主上
DOMAIN=pugame.site bash blive-deploy/scripts/apply-domain.sh
bash blive-deploy/scripts/build.sh
bash blive-deploy/scripts/release.sh
# 后端：复制 .env.example → .env，填密钥与 ALLOWED_ORIGINS=https://pugame.site
bash blive-deploy/scripts/start-backend.sh
caddy run --config blive-deploy/Caddyfile.prod   # apply-domain 生成，已 gitignore
```

回滚：`bash blive-deploy/scripts/rollback.sh`。详见 `blive-deploy/DEPLOY.md`。

---

## 本地开发

```bash
# 后端
cd blive-h5-backend && cp .env.example .env   # 填本地密钥；勿提交 .env
npm i && npm run dev   # :8787

# 前端（Vite proxy → 8787）
cd bilibili-live-h5-plugin && npm i && npm run dev
```

---

## 推送到 GitHub（本机尚未登录 `gh`）

仓库目标：`https://github.com/puc6h806-svg/pugame-live-h5`

1. 在 GitHub 上以 owner `puc6h806-svg` **新建空仓库** `pugame-live-h5`（不要勾选自动 README）。
2. 本目录若已有本地 commit，执行：

```bash
cd /workspace/pugame-live-h5
git remote add origin git@github.com:puc6h806-svg/pugame-live-h5.git
# 或 HTTPS：https://github.com/puc6h806-svg/pugame-live-h5.git
git push -u origin main
```

3. 配置 Secrets `CLOUDFLARE_*`，部署 Pages，挂 Worker，改掉 apex `SAMEORIGIN`，宿主设 `ALLOWED_ORIGINS`。
4. 开放平台发布 URL 填：`https://pugame.site/`
