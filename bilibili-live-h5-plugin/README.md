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
| 写配置 | `PUT /api/config` body `{ roomId, appId?, danmaku?, gift?, layout?, notice? }` → 推 `config_updated` |
| 事件 | `WS /ws?token=<JWT>` JSON：`danmaku` / `gift` / `config_updated` / `error` |

双心跳（WS + `/v2/app/heartbeat`）在**后端**完成；前端不发心跳。本服务 WS 意外断开后会自动重连（退避，上限约 10s；`UNAUTHORIZED` / `ROOM_LIMIT` 停止重连）。

### 归一化事件字段

```ts
danmaku: { type, id, uid, uname, msg, text?, avatar?, ts, highlight? }  // 文本仍读 msg；text 与 msg 相同
gift:    { type, id, uid, uname, giftId, giftName, num, price, ts, combo? }
config_updated: { type, config }
error:   { type, code: UNAUTHORIZED|ROOM_LIMIT|MSG_TYPE|INTERNAL, message }
```

## 双态（plug_env）

- `plug_env=0`（默认）：运行态 — 弹幕墙 + 礼物层
- `plug_env=1`：设置态 — 配置表单 + 可选预览条

## 运行态（重连 / 弹幕 / 礼物连击）

本地预览：`http://localhost:5173/?plug_env=0&code=主播身份码`（`VITE_MOCK=0`，Vite 把 `/api` 与 `/ws` 代理到 `:8787`）。

- **重连条**：运行态顶部一行。首次为「连接中」，连上后收起；断线为「已断开重连中」；再次连上为「已恢复」，约 2.4s 后自动收起。
- **弹幕**：深色气泡、更高对比和行距；昵称小一号、正文更大更亮。上墙仍是原路径（预算 ≤500ms，只在超时打日志）。关闭弹幕后列表立刻清空，再打开不会把旧弹幕补回来。
- **礼物连击**：同一用户、同一 `giftId`，展示过程中或排队 2s 内的连击合成一张卡（`num` 相加，数字弹出，并显示「连击」）。同屏最多 1 张全屏卡；上一张按 `durationMs` 卸载（最短 800ms，连击会从最后一次命中重新计时）后，至少再等 300ms 才播下一张。低于 `minPrice` 的礼物不上屏。

## 配置项

| 字段 | 前端默认 | 说明 |
|------|----------|------|
| `danmaku.enabled` | `true` | 是否显示弹幕 |
| `danmaku.maxLines` | `8` | 最大行数（与后端房间默认一致） |
| `danmaku.showAvatar` | `true` | 是否显示头像 |
| `danmaku.fontSize` / `opacity` / `enterMs` | `14` / `1` / `300` | 样式；设置态表单暂未露出，随配置往返 |
| `danmaku.highlightKeywords` / `blockKeywords` | `[]` | 后端匹配；本页不另做高亮 UI |
| `gift.enabled` | `true` | 是否显示礼物 |
| `gift.minPrice` | `0` | 最低价格（官方整数单位） |
| `gift.durationMs` | `3000` | 礼物展示时长 |
| `gift.comboWindowMs` | `3000` | 服务端连击窗；`0` 关闭合并 |
| `layout.wallPosition` / `giftAnchor` | `right` / `center` | 布局 |
| `notice.enterEnabled` / `guardEnabled` / `scEnabled` | `false` | P2 预留，默认关 |

设置态 `openedMsgTypes.danmaku|gift === false` 时灰显并标明「未开通消息类型」。

## 错误码 → 中文（一行）

| code | 文案 |
|------|------|
| `NO_CODE` | 请提供身份码 |
| `UNAUTHORIZED` | 未授权或验签失败 |
| `ROOM_LIMIT` | 连接数已满或房间不可用 |
| `MSG_TYPE` | 消息类型未开通 |
| `INTERNAL` | 服务异常请稍后重试（上游结束时 message 为「上游连接已结束」） |

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
  components/            # DanmakuWall、GiftLayer、ConnectionStatus、SettingsForm、ErrorToast
  lib/                    # query session verify eventChannel config errorMap types env
  mock/eventMock.ts       # 仅 VITE_MOCK=1
```

## 已知缺口

- 无有效身份码无法真收弹幕/礼物（后端会 401「身份码错误」等）。
- 开放平台须已开通 `LIVE_OPEN_PLATFORM_DM` / `SEND_GIFT`；未开通则无对应事件。
- 后端密钥与上游长连细节不暴露给 H5。
