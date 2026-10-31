# 哔哩哔哩直播 H5 插件 MVP · 弹幕墙 + 礼物特效

可被 `https://play-live.bilibili.com` iframe 嵌入的轻量 H5。双态（运行 / 设置），只消费后端归一化事件，不解析 B 站原始 `cmd`。

配套后端：`/workspace/blive-h5-backend`（默认 `http://127.0.0.1:8787`）。

## 技术栈

- Vite + Vue 3 + TypeScript
- 联调默认 `VITE_MOCK=0`：真连后端 session + WS
- 可选 `VITE_MOCK=1`：跳过 session、本地定时推 `danmaku` / `gift`

## 快速开始（联调）

1. 启动后端（另开终端）：

```bash
cd /workspace/blive-h5-backend
# 已配置 .env（BILI_* / SESSION_SECRET），切勿把密钥写进前端
npm start   # :8787
```

2. 启动本前端：

```bash
cd /workspace/bilibili-live-h5-plugin
npm install
npm run dev   # :5173，/api 与 /ws 代理到 127.0.0.1:8787
```

3. 浏览器带**主播身份码**打开（`code` 或应用商店注入的 `Code`）：

| 模式 | URL 示例 |
|------|----------|
| 运行态 | http://localhost:5173/?plug_env=0&code=主播身份码 |
| 设置态 | http://localhost:5173/?plug_env=1&code=主播身份码 |

无身份码时页面只显示一行：**请提供身份码**（不会要密钥、不会伪造密钥）。

生产构建：

```bash
npm run build
npm run preview
```

## 环境变量

见 `.env.example` / `.env.development`：

| 变量 | 联调建议 | 说明 |
|------|----------|------|
| `VITE_MOCK` | `0` | `1`=本地 mock；`0`=真 session + WS |
| `VITE_API_BASE` | 空 | 空则同源 `/api`（dev 由 Vite proxy → `:8787`） |
| `VITE_WS_URL` | 空 | 空则同源 `/ws?token=`（dev proxy，`ws: true`） |

**不要**把 `BILI_ACCESS_*` / Secret / `auth_body` 写进前端。

切回纯 mock 预览：在 `.env.development` 设 `VITE_MOCK=1` 后重启 `npm run dev`（可不带 `code`）。

## 对接后端 API（以 blive-h5-backend 为准）

| 能力 | 约定 |
|------|------|
| 开场 | `POST /api/session/start` body `{ "code": "<身份码>" }` → `{ token, roomId, anchor, expiresIn }` |
| 结束 | `POST /api/session/end` Header `Authorization: Bearer <token>` |
| 读配置 | `GET /api/config?roomId=&appId=` → `{ roomId, appId, config }` |
| 写配置 | `PUT /api/config` body `{ roomId, appId?, danmaku?, gift? }` → 推 `config_updated` |
| 事件 | `WS /ws?token=<JWT>` JSON：`danmaku` / `gift` / `config_updated` / `error` |

双心跳（WS + `/v2/app/heartbeat`）在**后端**完成；前端只需保持本服务 WS 不断。

### 归一化事件字段

```ts
danmaku: { type, id, uid, uname, msg, avatar?, ts }   // 文本字段是 msg
gift:    { type, id, uid, uname, giftId, giftName, num, price, ts }
config_updated: { type, config: { danmaku, gift } }
error:   { type, code: UNAUTHORIZED|ROOM_LIMIT|MSG_TYPE|INTERNAL, message? }
```

## 双态（plug_env）

- `plug_env=0`（默认）：运行态 — 弹幕墙 + 礼物层
- `plug_env=1`：设置态 — 配置表单 + 可选预览条

## 配置项

| 字段 | 前端默认 | 说明 |
|------|----------|------|
| `danmaku.enabled` | `true` | 是否显示弹幕 |
| `danmaku.maxLines` | `8` | 最大行数（后端默认 50，以房间配置为准） |
| `danmaku.showAvatar` | `true` | 是否显示头像 |
| `gift.enabled` | `true` | 是否显示礼物 |
| `gift.minPrice` | `0` | 最低价格（官方整数单位） |
| `gift.durationMs` | `3000` | 礼物展示时长 |

设置态 `openedMsgTypes.danmaku|gift === false` 时灰显并标明「未开通消息类型」。

## 错误码 → 中文（一行）

| code | 文案 |
|------|------|
| `NO_CODE` | 请提供身份码 |
| `UNAUTHORIZED` | 身份码无效或会话已过期（若后端带中文 message 则优先展示） |
| `ROOM_LIMIT` | 该房间连接数已达上限… |
| `MSG_TYPE` | 该消息类型未开通 |
| `INTERNAL` | 服务异常，请稍后重试 |

## iframe / HTTPS

- 正式嵌入须 **HTTPS**。
- Vite 已设 `Content-Security-Policy: frame-ancestors https://play-live.bilibili.com …`
- **不要**设 `X-Frame-Options: DENY`。

## 目录

```
src/
  App.vue                 # plug_env 切视图；session/start 门禁
  views/RuntimeView.vue   # 弹幕墙 + 礼物层；听 WS
  views/SettingsView.vue  # GET/PUT /api/config
  components/
  lib/                    # query session verify eventChannel config errorMap types env
  mock/eventMock.ts       # 仅 VITE_MOCK=1
```

## 已知缺口

- 无有效身份码无法真收弹幕/礼物（后端会 401「身份码错误」等）。
- 开放平台须已开通 `LIVE_OPEN_PLATFORM_DM` / `SEND_GIFT`；未开通则无对应事件。
- 后端密钥与上游长连细节不暴露给 H5。
