import { DEFAULT_CONFIG, type PluginConfig } from './types'
import { apiBase, isMock } from './env'
import { ApiError } from './session'

const STORAGE_KEY = 'blive-h5-plugin-config'

export function loadLocalConfig(): PluginConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_CONFIG)
    const parsed = JSON.parse(raw) as PluginConfig
    return mergeConfig(DEFAULT_CONFIG, parsed)
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveLocalConfig(config: PluginConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function mergeConfig(base: PluginConfig, patch: Partial<PluginConfig>): PluginConfig {
  return {
    danmaku: { ...base.danmaku, ...(patch.danmaku ?? {}) },
    gift: { ...base.gift, ...(patch.gift ?? {}) },
    openedMsgTypes: {
      ...base.openedMsgTypes,
      ...(patch.openedMsgTypes ?? {}),
    },
  }
}

export interface ConfigContext {
  roomId: number | string
  appId?: string | number
}

/** GET /api/config?roomId=&appId= — mock → localStorage */
export async function fetchConfig(ctx?: ConfigContext): Promise<PluginConfig> {
  if (isMock() || !ctx?.roomId) {
    return loadLocalConfig()
  }
  const qs = new URLSearchParams({ roomId: String(ctx.roomId) })
  if (ctx.appId != null && ctx.appId !== '') qs.set('appId', String(ctx.appId))
  try {
    const res = await fetch(`${apiBase()}/api/config?${qs}`)
    if (!res.ok) return loadLocalConfig()
    const data = (await res.json()) as { config?: PluginConfig }
    if (data.config) {
      const merged = mergeConfig(DEFAULT_CONFIG, data.config)
      saveLocalConfig(merged)
      return merged
    }
  } catch {
    /* fall through */
  }
  return loadLocalConfig()
}

/** PUT /api/config { roomId, appId?, danmaku?, gift? } — mock → localStorage */
export async function saveConfig(config: PluginConfig, ctx?: ConfigContext): Promise<PluginConfig> {
  if (isMock() || !ctx?.roomId) {
    saveLocalConfig(config)
    return config
  }
  const body: Record<string, unknown> = {
    roomId: typeof ctx.roomId === 'string' ? Number(ctx.roomId) || ctx.roomId : ctx.roomId,
    danmaku: config.danmaku,
    gift: config.gift,
  }
  if (ctx.appId != null && ctx.appId !== '') body.appId = ctx.appId

  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('NETWORK_ERROR')
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string }
    throw new ApiError(data.code || 'CONFIG_SAVE_FAIL', data.message, res.status)
  }
  const data = (await res.json().catch(() => ({}))) as { config?: PluginConfig }
  const next = data.config ? mergeConfig(DEFAULT_CONFIG, data.config) : config
  saveLocalConfig(next)
  return next
}
