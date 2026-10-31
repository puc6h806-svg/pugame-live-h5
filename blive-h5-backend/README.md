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

错误码只有四个，`message` 为短中文（见下方错误码表）：`UNAUTHORIZED`、`ROOM_LIMIT`（含上游 **7010**）、`INTERNAL`。身份码/签名/token 过期都是 `UNAUTHORIZED`，不要另造会话过期码。

### `POST /api/session/end`

Header：`Authorization: Bearer <token>`

调用 `/v2/app/end` 并关闭该房上游 WS；无订阅前端时也会自动 end。

### `GET /api/config?roomId=&appId=`

读取房间配置（内存 Map，键 `roomId+appId`）。`appId` 可省略，默认用 `BILI_APP_ID`。

### `PUT /api/config`

部分更新：只写要改的字段，未出现的字段保持原值。未知键忽略。关键词超过 20 条、`opacity` 超出 0–1、非法枚举 → `400` + `INTERNAL` / `配置无效`。

```json
{
  "roomId": 123456,
  "appId": "可选",
  "danmaku": {
    "enabled": true,
    "maxLines": 8,
    "showAvatar": true,
    "fontSize": 14,
    "opacity": 1,
    "enterMs": 300,
    "highlightKeywords": ["你好"],
    "blockKeywords": ["广告"]
  },
  "gift": { "enabled": true, "minPrice": 0, "durationMs": 3000, "comboWindowMs": 3000 },
  "layout": { "wallPosition": "right", "giftAnchor": "center" },
  "notice": { "enterEnabled": false, "guardEnabled": false, "scEnabled": false }
}
```

PUT 成功后向该房前端推送 `config_updated`（完整配置）。旧客户端只读 `enabled` / `maxLines` / `showAvatar` / `minPrice` / `durationMs` 仍然有效。

### 配置默认值（最终契约）

| 键 | 默认 | 说明 |
|----|------|------|
| `danmaku.enabled` | `true` | 关闭则不上发弹幕 |
| `danmaku.maxLines` | `8` | 行数（前端裁剪）。未设置过的房间由原先的 50 改为 8 |
| `danmaku.showAvatar` | `true` | `false` 时去掉 `avatar` |
| `danmaku.fontSize` | `14` | 字号 px，8–96 |
| `danmaku.opacity` | `1` | 0–1 |
| `danmaku.enterMs` | `300` | 入场动画时长 |
| `danmaku.highlightKeywords` | `[]` | ≤20。`msg` 子串、不区分大小写 → 事件 `highlight: true` |
| `danmaku.blockKeywords` | `[]` | ≤20。命中则丢弃，不另推 error |
| `gift.enabled` | `true` | 关闭则不上发礼物 |
| `gift.minPrice` | `0` | 与 `price` 同单位整数比较；先过滤再进入连击窗 |
| `gift.durationMs` | `3000` | 展示时长。未设置过的房间由原先的 4000 改为 3000 |
| `gift.comboWindowMs` | `3000` | 同 `roomId+uid+giftId` 合并窗口；**0 = 关闭合并、逐条推送** |
| `layout.wallPosition` | `"right"` | `left` \| `right` \| `bottom` |
| `layout.giftAnchor` | `"center"` | `center` \| `top` \| `bottom` |
| `notice.enterEnabled` | `false` | P2 预留，默认关 |
| `notice.guardEnabled` | `false` | P2 预留，默认关 |
| `notice.scEnabled` | `false` | P2 预留，默认关 |

### `GET /api/health`

健康检查。

### WebSocket `WS /ws?token=<JWT>&plugEnv=0|1`

也接受 `plug_env`。缺省 `plugEnv=0`。  
鉴权失败推送 `{ "type":"error", "code":"UNAUTHORIZED", "message":"未授权或验签失败" }` 后关闭。  
无 query token 时，可在 5 秒内发送 `auth` 帧；超时同样 `UNAUTHORIZED` 并关闭。  
同房前端连接 **≤5**，超限 `ROOM_LIMIT`。

连接成功后先推 `hello`，再推一条 `config_updated`（旧客户端忽略未知 `hello` 仍能拿到配置）。

#### 前端 → 服务端（文本帧，可选）

| type | 体 | 行为 |
|------|----|------|
| `auth` | `{ type, token, plugEnv? }` | 校验会话 JWT（不是开放平台密钥）。已附着且同房时只更新 `plugEnv` 并重发 `hello`；未附着则加入房间。 |
| `config.set` | `{ type, danmaku?, gift?, layout?, notice? }` | 与 PUT 相同的部分更新，作用在该连接的房间上，并广播 `config_updated`。未 `auth` 时回 `UNAUTHORIZED`。 |

其它 `type` 忽略。不要在帧里放 access secret。

## 事件约定（服务端 → H5）

JSON 文本帧：

| type | 字段 |
|------|------|
| `hello` | `{ type, roomId, plugEnv: 0\|1, config }` 连接成功后 |
| `danmaku` | `{ type, id, uid, uname, avatar?, msg, text, ts, highlight?, identity? }` |
| `gift` | `{ type, id, uid, uname, giftId, giftName, num, price, ts, combo? }` |
| `config_updated` | `{ type, config }` 完整房间配置 |
| `error` | `{ type, code, message }` `message` 为下表短中文 |

`msg` 与 `text` **同时下发且相等**（旧客户端继续读 `msg`）。`highlight` 仅在命中 `highlightKeywords` 时为 `true`，否则省略。`identity` 只来自 `LIVE_OPEN_PLATFORM_DM`，先命中先停；前三类都没中、又不能确认是普通人时省略该字段，不因此丢弃弹幕。

| 条件（先命中先停） | `identity` |
|------|------|
| `is_admin === 1`，或 `true` / 非 0 数字 / `"1"` / `"true"` | `admin` |
| 上一条未命中，且 `guard_level` 为 1 总督、2 提督、3 舰长 | `guard` |
| 前两条未命中，且 `fans_medal_wearing_status === true` 且 `fans_medal_level > 0` | `member` |
| 房管、大航海、粉丝牌都能排除（未佩戴或等级 ≤ 0 即不是 `member`） | `normal` |
| 没有命中前三条，且仍有字段缺失或无法解析，不能确认是 `normal` | 省略 |

- 上游 cmd：`LIVE_OPEN_PLATFORM_DM` → `danmaku`；`LIVE_OPEN_PLATFORM_SEND_GIFT` → `gift`
- `uid`：优先 `open_id`，否则 `String(uid)`
- **`price`**：官方 int64 **原样透传**（`1000 = 1 元 = 10 电池`），是**单价**，不乘 `num`。与 `config.gift.minPrice` 做整数比较
- 弹幕：先 `enabled`，再 `blockKeywords`（命中丢弃、无 error），再按 `highlightKeywords` 打 `highlight`；`showAvatar=false` 去掉 `avatar`
- 礼物：先 `enabled` + `minPrice`，通过后才进入连击窗

### 连击合并

键：`roomId + uid + giftId`。窗：`gift.comboWindowMs`。

- `0`：每条上游礼物立刻推送，不带 `combo`
- `> 0`：窗口从该键**第一条**礼物起算，**不因后续礼物重置**（延迟上界就是窗口长度）。窗内累加 `num`，到期推**一条**。`id` / `ts` / `uname` / `giftName` / `price` 用**最新一条**（`price` 仍是单价）
- 合并了 2 条及以上时带 `combo`，值等于合并后的 `num`。窗口内只有 1 条则省略 `combo`
- 把 `comboWindowMs` 改为 `0` 会立刻冲刷已在窗内的礼物。房间结束前也会冲刷，避免丢掉已接收的礼物

默认 `3000`：礼物最多晚约 3 秒、同键连击并成一条。要恢复逐条推送，把该房间 `comboWindowMs` 设为 `0`。

### 错误码（仅此四个）

不要新增 `UPSTREAM_*` / `SESSION_EXPIRED` 之类的码。上游结束用 `INTERNAL` + 明确 `message`。

| code | message | 前端建议 |
|------|---------|----------|
| `UNAUTHORIZED` | 未授权或验签失败 | 身份码、签名、JWT 无效或过期都是这个码。重新 `POST /api/session/start`，不要拿旧 token 死循环 |
| `ROOM_LIMIT` | 连接数已满或房间不可用 | 同房前端已达 5，或上游 7010。关掉其它窗口后再试，**不要紧循环重连** |
| `MSG_TYPE` | 消息类型未开通 | 保留给明确拒绝。未开通的 cmd **不会**刷这个错 |
| `INTERNAL` | 服务异常请稍后重试 | 通用失败。退避后重试 |
| `INTERNAL` | 上游连接已结束 | 上游 WS 节点都失败或场次长连断开。服务端已 `app/end`。可提示场次结束；要再开须重新 `session/start`，不要紧循环 |

### P2 通知预留（默认关）

`notice.enterEnabled` / `guardEnabled` / `scEnabled` 默认 `false`。对应 cmd（`LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER`、`LIVE_OPEN_PLATFORM_GUARD`、`LIVE_OPEN_PLATFORM_SUPER_CHAT`）即使把开关打开也**只走占位 hook、不向客户端推事件**，避免未开通类型刷 `MSG_TYPE`。默认配置下弹幕过滤与字段与现网一致（另外同时带 `text`）。礼物多了默认 3000ms 连击合并，把 `comboWindowMs` 设为 `0` 即逐条推送。

## 核心行为摘要

1. **HMAC-SHA256 鉴权**：body MD5 → 6 行 `x-bili-*` 字典序拼接 → `HMAC-SHA256(secret).hex` 小写 → `Authorization`；封装 `signedPost`。
2. **生命周期**：`/v2/app/start` → 上游 WSS（`wss_link[0]`，失败切下一节点）+ `auth_body`（`OP_AUTH=7`）→ 双心跳均 **20s**（WS `OP_HEARTBEAT=2` + HTTP `/v2/app/heartbeat`）→ `end` 必达（前端无订阅 / `session/end` / 上游断开 / `SIGINT|SIGTERM`）。
3. **连接治理**：client 模式一房一上游连；同一 `game_id` 重复 start 复用上游，不另开一条。多前端复用；本服务前端计数 ≤5；上游 7010 → `ROOM_LIMIT`。`wss_link` 按顺序故障转移；全部失败则推 `INTERNAL` / `上游连接已结束` 并 **`app/end`**。
4. **协议**：大端 Proto；`Version=2` zlib 解压后递归拆多包；只处理已开通的 DM / SEND_GIFT。双心跳均 **20s**。

## 目录结构

```
src/
  bili/       sign.ts, client.ts, wsProto.ts, wsClient.ts, events.ts
  session/    token.ts
  config/     store.ts, schema.ts
  gateway/    roomHub.ts, routes.ts, danmakuPolicy.ts, giftCombo.ts, noticeHook.ts, inbound.ts
  types/      events.ts, config.ts
  utils/      env.ts
  index.ts
tests/        sign.test.ts, events.test.ts, policy.test.ts
```

## 与前端设计师 / 联调工程师对接

- H5 流程：用户输入身份码 → `POST /api/session/start` → 用返回的 `token` 连 `ws://<host>/ws?token=…` → 收事件；调配置用 `GET/PUT /api/config`。
- 前端**不要**持有 `BILI_ACCESS_*` / `auth_body` / 原始 wss 地址。
- 联调时确认开放平台已开通 `LIVE_OPEN_PLATFORM_DM` 与 `LIVE_OPEN_PLATFORM_SEND_GIFT`；未开通类型忽略，不向前端刷 `MSG_TYPE`。
- 礼物特效时长读 `config.gift.durationMs`；弹幕行数上限读 `config.danmaku.maxLines`（前端渲染侧裁剪）。字号/透明度/入场/`layout` 由前端渲染，后端只保存并随 `hello` / `config_updated` 下发。
- 弹幕文本读 `msg` 或 `text`（二者相同）。`highlight === true` 时可高亮。`gift.combo` 缺省表示这条不是多条合并的结果；`num` 已是应展示的数量。

## 口径假设 / 待确认

| 项 | 本仓库假设 |
|----|------------|
| `price` | 官方 int64 透传；`minPrice` 同单位整数比较 |
| `7010` | 映射为 `ROOM_LIMIT`（同应用单房最多 5 连接） |
| 双心跳间隔 | 正文 **20s**（不用表旁注 30s） |
| 本服务前端上限 | 每房 5；与上游 7010 对齐。同一 game_id 重复 start 复用上游 |
| 连击 | 默认窗 3000ms，键 `roomId+uid+giftId`；`comboWindowMs=0` 逐条 |
| 错误码 | 仅 `UNAUTHORIZED` `ROOM_LIMIT` `MSG_TYPE` `INTERNAL`；上游结束是 `INTERNAL` + `上游连接已结束` |
| P2 notice | 三开关默认 false；不推送、不刷 MSG_TYPE |
| `app_id` | env 数字串，JSON 以 number 发送（13 位内安全） |

密钥仅来自环境变量；`.gitignore` 已忽略 `.env` / `node_modules` / `dist`。
