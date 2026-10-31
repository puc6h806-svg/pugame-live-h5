# 上线前域名清单（需用户确认）

正式挂 HTTPS / 填开放平台发布地址前，请确认下面几项（**不要编造域名**）：

1. **插件公网域名（FQDN，无路径）**  
   例如 `plugin.example.com`（不要写 `https://` 或 `/path`）。

2. **DNS 指到哪里**  
   - 本 box 公网 IP（若有且 80/443 可达），或  
   - 用户自有 VPS 公网 IP，或  
   - Cloudflare 代理（橙云）指向上述主机。

3. **证书方式**  
   - Caddy 自动 HTTPS（推荐，见 `Caddyfile.prod`），或  
   - Let’s Encrypt + certbot + nginx（见 `nginx/nginx.prod.conf`），或  
   - 已有证书路径（告知 `fullchain` / `privkey`）。

4. **是否同源部署（推荐：是）**  
   H5 与 `/api`、`/ws` 同域，前端 `VITE_API_BASE` / `VITE_WS_URL` 保持为空。

5. **可选：是否一并解析 `www`**  
   若需要，是否把 `www.` 同域重定向到裸域（或反过来）。

6. **开放平台发布 URL**  
   填：`https://<你的域名>/`  
   后端同步：`ALLOWED_ORIGINS=https://<你的域名>`（确认域名后再改 `.env`，本脚本不自动改）。

拿到 FQDN 后执行：

```bash
DOMAIN=你的域名 bash /workspace/blive-deploy/scripts/apply-domain.sh
```

详见 `DEPLOY.md`「生产域名 TLS」一节。
