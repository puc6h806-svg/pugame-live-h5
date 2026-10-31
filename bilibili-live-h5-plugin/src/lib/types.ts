/** Plugin configuration. openedMsgTypes is a frontend-only UI hint. */
export interface PluginConfig {
  danmaku: {
    enabled: boolean
    maxLines: number
    showAvatar: boolean
    /** CSS px. Backend default 14. */
    fontSize: number
    /** 0–1. Backend default 1. */
    opacity: number
    /** Enter animation ms. Backend default 300. */
    enterMs: number
    /** Case-insensitive substring; backend sets danmaku.highlight. Max 20. */
    highlightKeywords: string[]
    /** Case-insensitive substring; backend drops the danmaku. Max 20. */
    blockKeywords: string[]
  }
  gift: {
    enabled: boolean
    /** Official integer units (1000 = 1 CNY); compare with gift.price as-is. */
    minPrice: number
    durationMs: number
    /** Server combo window. 0 = no merge. Backend default 3000. */
    comboWindowMs: number
  }
  layout: {
    wallPosition: 'left' | 'right' | 'bottom'
    giftAnchor: 'center' | 'top' | 'bottom'
  }
  /** P2 reserved. Default false — backend does not push these cmds. */
  notice: {
    enterEnabled: boolean
    guardEnabled: boolean
    scEnabled: boolean
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
    fontSize: 14,
    opacity: 1,
    enterMs: 300,
    highlightKeywords: [],
    blockKeywords: [],
  },
  gift: {
    enabled: true,
    minPrice: 0,
    durationMs: 3000,
    comboWindowMs: 3000,
  },
  layout: {
    wallPosition: 'right',
    giftAnchor: 'center',
  },
  notice: {
    enterEnabled: false,
    guardEnabled: false,
    scEnabled: false,
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
  /** Barrage text. Backend sends `msg` and the same string as `text`. */
  msg: string
  text?: string
  avatar?: string
  ts: number
  /** Set by the backend when highlightKeywords match. Omitted otherwise. */
  highlight?: boolean
  /**
   * Open-platform role already mapped by the backend.
   * Omitted when the backend cannot tell. `normal` draws no badge.
   */
  identity?: DanmakuIdentity
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
  /** Merged num when the backend combined 2+ gifts in comboWindowMs. */
  combo?: number
  /** Optional icon URL if backend ever adds it */
  giftIcon?: string
}

/** Backend-mapped room role on a danmaku. Not derived from raw guard_level / is_admin. */
export type DanmakuIdentity = 'admin' | 'guard' | 'member' | 'normal'

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
