# blive-h5-backend

哔哩哔哩直播 H5 插件「弹幕墙 + 礼物特效」后端（Node.js / TypeScript）。

服务端持有开放平台密钥与长连，向 H5 前端只下发短期会话 token 与公开字段；前端经本服务 WebSocket 接收归一化后的 `danmaku` / `gift` / `config_updated` / `error` 事件。

## 环境要求

- Node.js **20+**
- npm

## 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入真实值（切勿提交 .env）
```

| 变量 | 必填 | 说明 |
|------|------|------|
| `BILI_ACCESS_KEY_ID` | 是 | 开放平台 access key id |
| `BILI_ACCESS_KEY_SECRET` | 是 | 开放平台 access key secret（仅环境变量，禁止写入仓库/聊天/日志明文） |
| `BILI_APP_ID` | 是 | 项目 ID（数字字符串，按 int64 写入 API body） |
| `SESSION_SECRET` | 是 | 签发前端短期 JWT 的密钥 |
| `PORT` | 否 | 默认 `8787` |
| `ALLOWED_ORIGINS` | 否 | CORS 白名单，逗号分隔；空则开发期允许全部 |

API 域名固定为 **`https://live-open.biliapi.com`**（不要用 open-live.bilibili.com 当 API 域）。

## 启动

```bash
npm install
npm run build
npm start
# 开发热重载：
npm run dev
```

类型检查 / 测试：

```bash
npx tsc --noEmit
npm test
```

## 对外 API

### `POST /api/session/start`

身份码换票（**仅服务端**调 `/v2/app/start`）。

请求：

```json
{ "code": "<主播身份码>" }
```

响应：

```json
{
  "token": "<短期 JWT>",
  "roomId": 123456,
  "anchor": { "uname": "…", "uFace": "…", "roomId": 123456 },
  "expiresIn": 21600
}
```

**不会**返回：`access secret`、`auth_body`、完整 `wss_link` 等。

错误：`UNAUTHORIZED`（签名/身份码等）、`ROOM_LIMIT`（含上游 **7010** 同房同应用连接上限）、`INTERNAL`。

### `POST /api/session/end`

Header：`Authorization: Bearer <token>`

调用 `/v2/app/end` 并关闭该房上游 WS；无订阅前端时也会自动 end。

### `GET /api/config?roomId=&appId=`

读取房间配置（内存 Map，键 `roomId+appId`）。`appId` 可省略，默认用 `BILI_APP_ID`。

### `PUT /api/config`

```json
{
  "roomId": 123456,
  "appId": "可选",
  "danmaku": { "enabled": true, "maxLines": 50, "showAvatar": true },
  "gift": { "enabled": true, "minPrice": 0, "durationMs": 4000 }
}
```

默认：弹幕 `enabled=true, maxLines=50, showAvatar=true`；礼物 `enabled=true, minPrice=0, durationMs=4000`。  
PUT 成功后向该房前端推送 `config_updated`。

### `GET /api/health`

健康检查。

### WebSocket `WS /ws?token=<JWT>`

鉴权失败推送 `{ "type":"error", "code":"UNAUTHORIZED" }` 后关闭。  
同房前端连接约 **≤5**，超限 `ROOM_LIMIT`。

## 事件约定（服务端 → H5）

JSON 文本帧：

| type | 字段 |
|------|------|
| `danmaku` | `{ type, id, uid, uname, msg, avatar?, ts }` |
| `gift` | `{ type, id, uid, uname, giftId, giftName, num, price, ts }` |
| `config_updated` | `{ type, config: { danmaku, gift } }` |
| `error` | `{ type, code: UNAUTHORIZED\|ROOM_LIMIT\|MSG_TYPE\|INTERNAL, message? }` |

- 上游 cmd：`LIVE_OPEN_PLATFORM_DM` → `danmaku`；`LIVE_OPEN_PLATFORM_SEND_GIFT` → `gift`
- `uid`：优先 `open_id`，否则 `String(uid)`
- **`price`**：官方 int64 **原样透传**（`1000 = 1 元 = 10 电池`），与 `config.gift.minPrice` 做整数比较，不改单位
- 推送前按配置过滤：`danmaku.enabled` / `gift.enabled` / `gift.minPrice`；`showAvatar=false` 时去掉 `avatar`

## 核心行为摘要

1. **HMAC-SHA256 鉴权**：body MD5 → 6 行 `x-bili-*` 字典序拼接 → `HMAC-SHA256(secret).hex` 小写 → `Authorization`；封装 `signedPost`。
2. **生命周期**：`/v2/app/start` → 上游 WSS（`wss_link[0]`，失败切下一节点）+ `auth_body`（`OP_AUTH=7`）→ 双心跳均 **20s**（WS `OP_HEARTBEAT=2` + HTTP `/v2/app/heartbeat`）→ `end` 必达（前端无订阅 / `session/end` / `SIGINT|SIGTERM`）。
3. **连接治理**：client 模式一房一上游连；多前端复用；本服务前端计数 ≤5；上游 7010 → `ROOM_LIMIT`。
4. **协议**：大端 Proto；`Version=2` zlib 解压后递归拆多包；只处理已开通的 DM / SEND_GIFT。

## 目录结构

```
src/
  bili/       sign.ts, client.ts, wsProto.ts, wsClient.ts, events.ts
  session/    token.ts
  config/     store.ts
  gateway/    roomHub.ts, routes.ts
  types/      events.ts, config.ts
  utils/      env.ts
  index.ts
tests/        sign.test.ts, events.test.ts
```

## 与前端设计师 / 联调工程师对接

- H5 流程：用户输入身份码 → `POST /api/session/start` → 用返回的 `token` 连 `ws://<host>/ws?token=…` → 收事件；调配置用 `GET/PUT /api/config`。
- 前端**不要**持有 `BILI_ACCESS_*` / `auth_body` / 原始 wss 地址。
- 联调时确认开放平台已开通 `LIVE_OPEN_PLATFORM_DM` 与 `LIVE_OPEN_PLATFORM_SEND_GIFT`；未开通类型会被忽略（或记日志）。
- 礼物特效时长读 `config.gift.durationMs`；弹幕行数上限读 `config.danmaku.maxLines`（前端渲染侧裁剪）。

## 口径假设 / 待确认

| 项 | 本仓库假设 |
|----|------------|
| `price` | 官方 int64 透传；`minPrice` 同单位整数比较 |
| `7010` | 映射为 `ROOM_LIMIT`（同应用单房最多 5 连接） |
| 双心跳间隔 | 正文 **20s**（不用表旁注 30s） |
| 本服务前端上限 | 每房 5；与上游 7010 对齐，避免重复 start |
| `app_id` | env 数字串，JSON 以 number 发送（13 位内安全） |

密钥仅来自环境变量；`.gitignore` 已忽略 `.env` / `node_modules` / `dist`。
