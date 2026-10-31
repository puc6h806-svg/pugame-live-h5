import { apiBase } from './env'
import type { BackendError } from './types'

export interface SessionInfo {
  token: string
  roomId: number
  anchor?: { uname: string; uFace?: string; roomId: number }
  expiresIn?: number
}

export class ApiError extends Error {
  code: string
  status?: number
  constructor(code: string, message?: string, status?: number) {
    super(message || code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

/**
 * POST /api/session/start { code } — 用主播身份码换短期 token。
 * 密钥/auth_body/wss_link 只在后端，前端只拿 token + 公开字段。
 */
export async function startSession(code: string): Promise<SessionInfo> {
  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch {
    throw new ApiError('NETWORK_ERROR')
  }
  const data = (await res.json().catch(() => ({}))) as Partial<SessionInfo> & Partial<BackendError>
  if (!res.ok || !data.token || typeof data.roomId !== 'number') {
    throw new ApiError(data.code || 'UNAUTHORIZED', data.message, res.status)
  }
  return {
    token: data.token,
    roomId: data.roomId,
    anchor: data.anchor,
    expiresIn: data.expiresIn,
  }
}

/** POST /api/session/end (Bearer) — best effort; keepalive so it survives unload. */
export function endSession(token: string): void {
  try {
    void fetch(`${apiBase()}/api/session/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
