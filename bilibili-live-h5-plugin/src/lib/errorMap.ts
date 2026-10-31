const MAP: Record<string, string> = {
  // Backend normalized codes (blive-h5-backend)
  UNAUTHORIZED: '身份码无效或会话已过期',
  ROOM_LIMIT: '该房间连接数已达上限，请关闭其他插件窗口后重试',
  MSG_TYPE: '该消息类型未开通',
  INTERNAL: '服务异常，请稍后重试',
  // Frontend-local
  NO_CODE: '请提供身份码',
  WS_CLOSED: '长连已断开',
  WS_AUTH_FAIL: '长连鉴权失败',
  NETWORK_ERROR: '网络异常，请稍后重试',
  CONFIG_SAVE_FAIL: '配置保存失败',
  // Legacy aliases
  SIGN_INVALID: '签名校验失败',
  MSG_TYPE_CLOSED: '该消息类型未开通',
  RATE_LIMITED: '请求过于频繁',
  VERIFY_FAIL: '验签失败，无法启动插件',
  UNKNOWN: '出错了，请稍后重试',
}

const HAS_CJK = /[\u4e00-\u9fff]/

/** Map error code → one-line Chinese toast. Prefer CJK backend message when present. */
export function mapError(code: string, fallback?: string): string {
  const fb = fallback?.trim()
  if (fb && HAS_CJK.test(fb)) return fb.split('\n')[0]!.slice(0, 60)
  return MAP[code] ?? MAP.UNKNOWN!
}
