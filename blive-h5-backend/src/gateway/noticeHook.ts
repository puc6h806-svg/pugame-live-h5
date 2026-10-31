import type { NoticeConfig } from '../types/config';
import type { ClientEvent } from '../types/events';

export type NoticeKind = 'enter' | 'guard' | 'sc';

export type NoticeHookResult =
  | { action: 'not_notice' }
  | { action: 'ignore'; kind: NoticeKind }
  | { action: 'reserved'; kind: NoticeKind; event?: ClientEvent };

/** Reserved cmd names. Not subscribed by default; never pushed as events. */
const NOTICE_CMDS: Record<NoticeKind, readonly string[]> = {
  enter: ['LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER'],
  guard: ['LIVE_OPEN_PLATFORM_GUARD'],
  sc: ['LIVE_OPEN_PLATFORM_SUPER_CHAT'],
};

export function noticeKindOf(cmd: string): NoticeKind | null {
  const kinds: NoticeKind[] = ['enter', 'guard', 'sc'];
  for (const kind of kinds) {
    if (NOTICE_CMDS[kind].includes(cmd)) return kind;
  }
  return null;
}

/**
 * P2 placeholder. Default flags are false → ignore.
 * When a flag is true the cmd is still not turned into a client event
 * (`event` stays unset until that cmd is actually opened). Callers must not
 * emit MSG_TYPE for these; they may forward `event` only when present.
 */
export function applyNoticeHook(cmd: string, notice: NoticeConfig): NoticeHookResult {
  const kind = noticeKindOf(cmd);
  if (!kind) return { action: 'not_notice' };
  const enabled =
    kind === 'enter' ? notice.enterEnabled : kind === 'guard' ? notice.guardEnabled : notice.scEnabled;
  if (!enabled) return { action: 'ignore', kind };
  return { action: 'reserved', kind };
}
