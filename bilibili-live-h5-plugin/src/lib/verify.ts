import type { QueryParams } from './types'
import { isMock } from './env'
import { ApiError, startSession, type SessionInfo } from './session'

export interface VerifyResult {
  ok: boolean
  code?: string
  message?: string
  /** Short-lived JWT from POST /api/session/start, used for WS /ws?token= */
  token?: string
  roomId?: number
  anchor?: SessionInfo['anchor']
}

/**
 * 启动门禁：用 URL 上的身份码（?code= 或应用商店注入的 ?Code=）调
 * POST /api/session/start，成功拿到 token 后才允许建连。
 * Caller/Mid/Timestamp/Sign 等字段只读不发；签名/密钥校验全在后端，前端不持有任何密钥。
 * VITE_MOCK=1 时直接通过（本地 mock）。
 */
export async function verifySignature(params: QueryParams): Promise<VerifyResult> {
  if (isMock()) {
    return { ok: true, token: 'mock-token', roomId: 0 }
  }
  if (!params.code) {
    return { ok: false, code: 'NO_CODE' }
  }
  try {
    const s = await startSession(params.code)
    return { ok: true, token: s.token, roomId: s.roomId, anchor: s.anchor }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, code: e.code, message: e.message }
    return { ok: false, code: 'UNKNOWN' }
  }
}
