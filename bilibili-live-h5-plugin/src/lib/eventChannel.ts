import type { PluginEvent } from './types'
import { startMockChannel, type MockHandle } from '../mock/eventMock'
import { isMock, wsUrl } from './env'

export type EventHandler = (ev: PluginEvent) => void

export interface EventChannel {
  connect: () => void
  disconnect: () => void
  triggerError?: (code?: string) => void
}

/**
 * Prefer WebSocket `/ws?token=` (Vite proxies to backend :8787 in dev).
 * VITE_MOCK=1 uses timed mock pushes — never parses Bilibili raw cmd.
 * Dual heartbeat is done by the backend; frontend only keeps WS open.
 */
export function createEventChannel(
  onEvent: EventHandler,
  opts: { token?: string } = {},
): EventChannel {
  let ws: WebSocket | null = null
  let mock: MockHandle | null = null
  let closed = false

  const handleMessage = (raw: string) => {
    try {
      const data = JSON.parse(raw) as PluginEvent
      if (!data || typeof data !== 'object' || !('type' in data)) return
      if (
        data.type === 'danmaku' ||
        data.type === 'gift' ||
        data.type === 'config_updated' ||
        data.type === 'error'
      ) {
        onEvent(data)
      }
    } catch {
      /* ignore malformed */
    }
  }

  return {
    connect() {
      closed = false
      if (isMock()) {
        mock = startMockChannel(onEvent)
        return
      }
      if (!opts.token) {
        onEvent({ type: 'error', code: 'UNAUTHORIZED', message: '缺少会话 token' })
        return
      }
      const url = wsUrl(opts.token)
      ws = new WebSocket(url)
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') handleMessage(e.data)
      }
      ws.onerror = () => {
        if (!closed) onEvent({ type: 'error', code: 'WS_AUTH_FAIL' })
      }
      ws.onclose = () => {
        ws = null
      }
    },
    disconnect() {
      closed = true
      mock?.stop()
      mock = null
      if (ws) {
        ws.onclose = null
        ws.close()
        ws = null
      }
    },
    triggerError(code = 'UNKNOWN') {
      if (mock) mock.triggerError(code)
      else onEvent({ type: 'error', code })
    },
  }
}
