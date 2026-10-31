/** Plugin configuration (danmaku + gift). openedMsgTypes is frontend-only UI hint. */
export interface PluginConfig {
  danmaku: {
    enabled: boolean
    maxLines: number
    showAvatar: boolean
  }
  gift: {
    enabled: boolean
    /** Official integer units (1000 = 1 CNY); compare with gift.price as-is. */
    minPrice: number
    durationMs: number
  }
  /** Message types the room/app has opened; false → locked in settings */
  openedMsgTypes?: {
    danmaku?: boolean
    gift?: boolean
  }
}

export const DEFAULT_CONFIG: PluginConfig = {
  danmaku: {
    enabled: true,
    maxLines: 8,
    showAvatar: true,
  },
  gift: {
    enabled: true,
    minPrice: 0,
    durationMs: 3000,
  },
  openedMsgTypes: {
    danmaku: true,
    gift: true,
  },
}

/** Normalized events from backend WS — field names match blive-h5-backend. */
export type DanmakuEvent = {
  type: 'danmaku'
  id: string
  uid: string
  uname: string
  /** Barrage text (backend field is `msg`, not `text`) */
  msg: string
  avatar?: string
  ts: number
}

export type GiftEvent = {
  type: 'gift'
  id: string
  uid: string
  uname: string
  giftId: number
  giftName: string
  /** Gift count (backend field is `num`, not `giftNum`) */
  num: number
  /** Official integer: 1000 = 1 CNY = 10 batteries */
  price: number
  ts: number
  /** Optional icon URL if backend ever adds it */
  giftIcon?: string
}

export type ConfigUpdated = {
  type: 'config_updated'
  config: PluginConfig
}

export type ErrorEvent = {
  type: 'error'
  code: string
  message?: string
}

export type PluginEvent = DanmakuEvent | GiftEvent | ConfigUpdated | ErrorEvent

export type BackendError = {
  type?: 'error'
  code?: string
  message?: string
}

export type PlugEnv = 0 | 1

export interface QueryParams {
  plug_env: PlugEnv
  /** Identity code for POST /api/session/start (`?code=` or app-store `?Code=`) */
  code?: string
  Caller?: string
  Code?: string
  Mid?: string
  Timestamp?: string
  Sign?: string
  Signature?: string
  raw: URLSearchParams
}
