import type { DanmakuIdentity } from './types'

/** Roles that draw a badge. `normal` is a known value with no chrome. */
export type BadgeIdentity = Exclude<DanmakuIdentity, 'normal'>

export interface IdentityBadge {
  role: BadgeIdentity
  label: string
  accent: string
}

const META: Record<BadgeIdentity, IdentityBadge> = {
  admin: { role: 'admin', label: '房管', accent: '#7fd4ff' },
  guard: { role: 'guard', label: '舰长', accent: '#ff8eb4' },
  member: { role: 'member', label: '粉丝团', accent: '#9ddea0' },
}

/**
 * Map a normalized `danmaku.identity` to a badge.
 * Accepts only `admin` | `guard` | `member`. `normal`, missing, and anything else
 * (including raw guard_level / is_admin) return null.
 */
export function resolveIdentityBadge(identity: unknown): IdentityBadge | null {
  if (identity === 'admin' || identity === 'guard' || identity === 'member') {
    return META[identity]
  }
  return null
}
