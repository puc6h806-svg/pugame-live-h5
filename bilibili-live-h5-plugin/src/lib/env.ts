/** Centralized runtime env helpers (Vite import.meta.env). No secrets live here. */

export function isMock(): boolean {
  return import.meta.env.VITE_MOCK === '1'
}

/** Backend HTTP root. Empty → same-origin `/api` (dev: Vite proxy → :8787). */
export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
}

/** Backend WebSocket URL with `?token=`. Empty VITE_WS_URL → same-origin `/ws` (dev: Vite proxy). */
export function wsUrl(token: string): string {
  const configured = import.meta.env.VITE_WS_URL
  let u: URL
  if (configured) {
    u = new URL(configured, location.href)
  } else {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    u = new URL(`${proto}//${location.host}/ws`)
  }
  u.searchParams.set('token', token)
  return u.toString()
}
