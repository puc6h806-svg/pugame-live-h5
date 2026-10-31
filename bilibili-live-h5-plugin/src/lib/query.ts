import type { PlugEnv, QueryParams } from './types'

/** Parse Bilibili app-store / plugin URL query fields. */
export function parseQuery(search = window.location.search): QueryParams {
  const raw = new URLSearchParams(search)
  const envRaw = raw.get('plug_env')
  const plug_env: PlugEnv = envRaw === '1' ? 1 : 0

  const Code = raw.get('Code') ?? undefined
  // 身份码：优先 ?code=，其次应用商店注入的 ?Code=
  const code = (raw.get('code') ?? Code ?? '').trim() || undefined

  return {
    plug_env,
    code,
    Caller: raw.get('Caller') ?? undefined,
    Code,
    Mid: raw.get('Mid') ?? undefined,
    Timestamp: raw.get('Timestamp') ?? undefined,
    Sign: raw.get('Sign') ?? undefined,
    Signature: raw.get('Signature') ?? undefined,
    raw,
  }
}
