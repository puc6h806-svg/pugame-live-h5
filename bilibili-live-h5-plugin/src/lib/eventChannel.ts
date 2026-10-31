import type { PluginEvent } from './types'
import { startMockChannel, type MockHandle } from '../mock/eventMock'
import { isMock, wsUrl } from './env'

export type EventHandler = (ev: PluginEvent) => void

/** Runtime connection banner. `hidden` means the bar is collapsed. */
export type ConnPhase = 'connecting' | 'reconnecting' | 'recovered' | 'hidden'

export interface EventChannel {
  connect: () => void
  disconnect: () => void
  triggerError?: (code?: string) => void
}

const RECOVERED_HOLD_MS = 2400
const RETRY_BASE_MS = 600
const RETRY_CAP_MS = 10_000

function retryDelay(attempt: number): number {
  const exp = Math.min(4, Math.max(0, attempt))
  return Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** exp)
}

/**
 * Prefer WebSocket `/ws?token=` (Vite proxies to backend :8787 in dev).
 * VITE_MOCK=1 uses timed mock pushes — never parses Bilibili raw cmd.
 * `hello` and any other type are ignored.
 * Dual heartbeat stays on the backend; this client only reconnects the WS.
 */
export function createEventChannel(
  onEvent: EventHandler,
  opts: { token?: string; onStatus?: (phase: ConnPhase) => void } = {},
): EventChannel {
  let ws: WebSocket | null = null
  let mock: MockHandle | null = null
  let closed = true
  let openedOnce = false
  let suppressReconnect = false
  let attempt = 0
  let reconnectTimer = 0
  let recoverTimer = 0
  let listening = false

  const setPhase = (phase: ConnPhase) => {
    opts.onStatus?.(phase)
  }

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = 0
    }
  }

  const clearRecover = () => {
    if (recoverTimer) {
      clearTimeout(recoverTimer)
      recoverTimer = 0
    }
  }

  const handleMessage = (raw: string) => {
    try {
      const data = JSON.parse(raw) as PluginEvent
      if (!data || typeof data !== 'object' || !('type' in data)) return
      if (
        data.type !== 'danmaku' &&
        data.type !== 'gift' &&
        data.type !== 'config_updated' &&
        data.type !== 'error'
      ) {
        return
      }
      if (data.type === 'error' && (data.code === 'UNAUTHORIZED' || data.code === 'ROOM_LIMIT')) {
        suppressReconnect = true
        clearReconnect()
        clearRecover()
        setPhase('hidden')
      }
      onEvent(data)
    } catch {
      /* ignore malformed */
    }
  }

  const scheduleReconnect = () => {
    if (closed || suppressReconnect || reconnectTimer) return
    setPhase(openedOnce ? 'reconnecting' : 'connecting')
    const delay = retryDelay(attempt)
    attempt += 1
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0
      openSocket()
    }, delay)
  }

  const onOnline = () => {
    if (closed || suppressReconnect) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    clearReconnect()
    attempt = 0
    openSocket()
  }

  function openSocket() {
    if (closed || suppressReconnect) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
    if (!opts.token) {
      onEvent({ type: 'error', code: 'UNAUTHORIZED', message: '缺少会话 token' })
      setPhase('hidden')
      return
    }

    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws = null
    }

    setPhase(openedOnce ? 'reconnecting' : 'connecting')
    const socket = new WebSocket(wsUrl(opts.token))
    ws = socket

    socket.onopen = () => {
      if (ws !== socket || closed) return
      const recovered = openedOnce
      openedOnce = true
      attempt = 0
      clearRecover()
      if (recovered) {
        setPhase('recovered')
        recoverTimer = window.setTimeout(() => {
          recoverTimer = 0
          if (!closed && ws === socket && socket.readyState === WebSocket.OPEN) setPhase('hidden')
        }, RECOVERED_HOLD_MS)
      } else {
        setPhase('hidden')
      }
    }

    socket.onmessage = (e) => {
      if (ws !== socket) return
      if (typeof e.data === 'string') handleMessage(e.data)
    }

    socket.onerror = () => {
      /* close follows; the status bar covers transient drops */
    }

    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      if (closed || suppressReconnect) return
      clearRecover()
      scheduleReconnect()
    }
  }

  return {
    connect() {
      closed = false
      suppressReconnect = false
      if (isMock()) {
        mock?.stop()
        mock = startMockChannel(onEvent)
        setPhase('hidden')
        return
      }
      if (!listening) {
        window.addEventListener('online', onOnline)
        listening = true
      }
      openSocket()
    },
    disconnect() {
      closed = true
      clearReconnect()
      clearRecover()
      mock?.stop()
      mock = null
      if (listening) {
        window.removeEventListener('online', onOnline)
        listening = false
      }
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
        ws = null
      }
      setPhase('hidden')
    },
    triggerError(code = 'UNKNOWN') {
      if (mock) mock.triggerError(code)
      else onEvent({ type: 'error', code })
    },
  }
}
