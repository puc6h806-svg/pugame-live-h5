# GitHub 同步发布到 pugame.site（同源 H5 + /api + /ws）

## 架构结论

| 方案 | 能否同源代理 Node `/api` + `/ws` | 说明 |
|------|----------------------------------|------|
| **仅 GitHub Pages** | ❌ 不能 | 只托管静态；无法反代 Express/WS |
| **Cloudflare Pages + Worker（推荐）** | ✅ | Actions 构建前端 → Pages；Worker 把 `/api*`、`/ws*` 转到 `BACKEND_ORIGIN`，其余走 Pages 静态 |
| **单机 VPS + Caddy（备选）** | ✅ | `DOMAIN=pugame.site` 生成 `Caddyfile.prod`，静态 `current/` + 反代 `127.0.0.1:8787` |

开放平台要求：**HTTPS** + 可被 `https://play-live.bilibili.com/` iframe。响应头必须带：

- `X-Frame-Options: ALLOW-FROM https://play-live.bilibili.com/`
- `Content-Security-Policy: frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'`

**禁止**对插件页使用 `DENY` / `SAMEORIGIN`。

### 当前 apex 阻塞（探测结论）

- `https://pugame.site` 目前返回 **Cloudflare 403**，且带 **`X-Frame-Options: SAMEORIGIN`** → **直播姬/饭贩嵌不进去**。
- 上线前必须在 **Pages `_headers` 和/或 Worker / Transform Rules** 覆盖掉该头；检查区级「安全头 / Managed Headers」是否又写回 `SAMEORIGIN`。
- `www.pugame.site` 当前是另一套 **EdgeOne makers HTML**，与 apex 栈不同 → 需用户确认插件走 **裸域 apex** 还是 **www**（或重定向统一）。

已连接 GitHub 账号下 **尚无名为 `pugame` 的仓库**；创建/推送需用户授权后再做（本目录仅写模板，不自动 push）。

## 本目录文件

| 路径 | 用途 |
|------|------|
| `workflows/deploy-pages.yml.template` | push `main` → 构建前端 → `wrangler pages deploy`（含 Pages 备选注释） |
| `cloudflare/_headers` | Pages 嵌入头（覆盖 SAMEORIGIN） |
| `cloudflare/_redirects` | 可选 SPA `/* → /index.html` |
| `cloudflare/worker-same-origin.js.template` | 同源：静态←Pages，`/api`+`/ws`←`BACKEND_ORIGIN` |
| 备选 VPS | `/workspace/blive-deploy/Caddyfile.prod`（`apply-domain.sh` 生成） |

复制到真实仓库示例：

```text
<repo>/.github/workflows/deploy-pages.yml          ← 自 template 改名并填占位符
<repo>/blive-deploy/github/cloudflare/_headers    ← 或构建时 cp 进 dist/
```

前端路径占位：`FRONTEND_PATH=bilibili-live-h5-plugin`（单体根目录则设为 `.`）。

## 密钥与环境变量（勿提交 git）

### 后端宿主（VPS / Tunnel 后的 Node，仅环境变量或私密 secrets）

| 变量 | 说明 |
|------|------|
| `BILI_ACCESS_KEY_ID` | 开放平台 |
| `BILI_ACCESS_KEY_SECRET` | 开放平台 |
| `BILI_APP_ID` | 项目/应用 ID |
| `SESSION_SECRET` | H5 session 签名 |
| `PORT` | 默认 `8787` |
| **`ALLOWED_ORIGINS=https://pugame.site`** | 生产 CORS；同源时仍建议收紧 |

**禁止**把上述值写入公开仓库、Workflow 明文、聊天或脚本 `echo`。前端仓库可公开；构建时 `VITE_API_BASE` / `VITE_WS_URL` 留空（同源）。

### GitHub Actions → Cloudflare（仓库 Secrets）

| Secret | 用途 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Wrangler Pages deploy |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID |

Worker 变量（Dashboard / Wrangler，非公开）：`BACKEND_ORIGIN`、`PAGES_ORIGIN`（或 ASSETS 绑定）。

## Cloudflare 头覆盖清单

1. 把 `_headers` 放进 **Pages 发布根**（`dist/`）。
2. Worker 对 HTML 响应 **删除并重写** `X-Frame-Options`（模板已做）。
3. 若区级规则仍注入 `SAMEORIGIN`：用 **Transform Rules → Modify Response Header** 对 `pugame.site` 设为 `ALLOW-FROM https://play-live.bilibili.com/`，并确保 CSP `frame-ancestors` 存在。
4. 冒烟：`curl -sI https://pugame.site/` 不得出现 `SAMEORIGIN` / `DENY`；应见 ALLOW-FROM 与 frame-ancestors。

## 用户仍需提供（检查清单）

请开放平台解读向用户确认后回传：

1. **精确仓库** `owner/name` 或完整 URL（当前无 `pugame` 仓；是否新建 monorepo 还是只推前端？后端是否私有仓？）
2. **部署目标**：Cloudflare Pages + Worker（推荐）还是 **仅 VPS Caddy**？是否已有 Cloudflare Pages 项目名？
3. **域名形态**：插件发布 URL 用 **`https://pugame.site/`** 还是 `www` / 子路径？apex 与 www（EdgeOne）如何统一？
4. **是否已有 GitHub Actions** / 现成 workflow 需合并？
5. **Node 跑在哪**：用户 VPS 公网、本机 + Named Tunnel、还是其它？`BACKEND_ORIGIN` 将是什么 HTTPS 基址？
6. **DNS**：`pugame.site` 是否已在 Cloudflare 区；橙云代理是否保留；谁有权改 Transform Rules / 自定义域。

确认后执行顺序（由部署侧落地，**不自动 push**）：填 workflow → 用户建仓/开 secrets → 部署 Pages → 挂 Worker 路由 → 宿主设 `ALLOWED_ORIGINS=https://pugame.site` → 改掉 SAMEORIGIN → 开放平台填发布 URL。

## 与 VPS 备选的关系

```bash
DOMAIN=pugame.site bash /workspace/blive-deploy/scripts/apply-domain.sh
# 生成 Caddyfile.prod / nginx.prod.conf（已 gitignore）
# 打印应手写进后端 .env 的：ALLOWED_ORIGINS=https://pugame.site
```

详见上级 [DEPLOY.md](../DEPLOY.md)。
