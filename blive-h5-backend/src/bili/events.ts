import type { DanmakuEvent, DanmakuIdentity, GiftEvent } from '../types/events';

const CMD_DM = 'LIVE_OPEN_PLATFORM_DM';
const CMD_GIFT = 'LIVE_OPEN_PLATFORM_SEND_GIFT';

interface RawCmd {
  cmd?: string;
  data?: Record<string, unknown>;
}

function asString(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function resolveUid(data: Record<string, unknown>): string {
  const openId = asString(data.open_id).trim();
  if (openId) return openId;
  return asString(data.uid, '0');
}

/**
 * `is_admin === 1` or another truthy flag (boolean true, non-zero number, "1"/"true").
 * Explicit non-admin is 0 / false / "" / "0" / "false".
 * Missing or unreadable → undefined (cannot rule admin in or out).
 */
function readAdmin(v: unknown): boolean | undefined {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return undefined;
    return v !== 0;
  }
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false' || s === '') return false;
  }
  return undefined;
}

/** Numeric guard/medal level. Missing or non-numeric → undefined (do not coerce to 0). */
function readLevel(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Official field is boolean. Only `true` / `false` decide wearing. */
function readWearing(v: unknown): boolean | undefined {
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

/**
 * LIVE_OPEN_PLATFORM_DM role. First match wins:
 * 1. admin — is_admin truthy
 * 2. guard — guard_level 1|2|3 (总督/提督/舰长)
 * 3. member — fans medal worn and level > 0
 * 4. normal — admin, guard, and medal are all present and ruled out
 * If nothing matched and a field needed to rule a role out is missing or
 * unreadable, omit identity instead of guessing "normal".
 * Never invent other labels, and never drop the danmaku.
 */
function resolveIdentity(data: Record<string, unknown>): DanmakuIdentity | undefined {
  const admin = readAdmin(data.is_admin);
  if (admin === true) return 'admin';

  const guard = readLevel(data.guard_level);
  if (guard === 1 || guard === 2 || guard === 3) return 'guard';

  const wearing = readWearing(data.fans_medal_wearing_status);
  const level = readLevel(data.fans_medal_level);
  if (wearing === true && level !== undefined && level > 0) return 'member';

  const adminRuledOut = admin === false;
  const guardRuledOut = guard !== undefined && guard !== 1 && guard !== 2 && guard !== 3;
  const memberRuledOut = wearing === false || (level !== undefined && level <= 0);
  if (adminRuledOut && guardRuledOut && memberRuledOut) return 'normal';
  return undefined;
}

/**
 * Normalize an upstream cmd JSON into a frontend event, or null if ignored.
 * Only LIVE_OPEN_PLATFORM_DM and LIVE_OPEN_PLATFORM_SEND_GIFT are handled.
 * Unknown / unsubscribed cmds return { skip: true } without error.
 */
export function normalizeCmd(
  raw: unknown,
):
  | { kind: 'event'; event: DanmakuEvent | GiftEvent }
  | { kind: 'skip'; cmd?: string }
  | { kind: 'unknown_type'; cmd: string } {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'skip' };
  }
  const msg = raw as RawCmd;
  const cmd = asString(msg.cmd);
  const data = (msg.data && typeof msg.data === 'object' ? msg.data : {}) as Record<string, unknown>;

  if (cmd === CMD_DM) {
    const text = asString(data.msg);
    const event: DanmakuEvent = {
      type: 'danmaku',
      id: asString(data.msg_id) || `dm-${asNumber(data.timestamp)}-${Math.random().toString(36).slice(2, 8)}`,
      uid: resolveUid(data),
      uname: asString(data.uname),
      msg: text,
      text,
      ts: asNumber(data.timestamp, Math.floor(Date.now() / 1000)),
    };
    const avatar = asString(data.uface).trim();
    if (avatar) event.avatar = avatar;
    const identity = resolveIdentity(data);
    if (identity) event.identity = identity;
    return { kind: 'event', event };
  }

  if (cmd === CMD_GIFT) {
    // price: official int64, 1000 = 1 CNY = 10 batteries — pass through, no unit conversion
    const event: GiftEvent = {
      type: 'gift',
      id: asString(data.msg_id) || `gift-${asNumber(data.timestamp)}-${Math.random().toString(36).slice(2, 8)}`,
      uid: resolveUid(data),
      uname: asString(data.uname),
      giftId: asNumber(data.gift_id),
      giftName: asString(data.gift_name),
      num: asNumber(data.gift_num, 1),
      price: asNumber(data.price),
      ts: asNumber(data.timestamp, Math.floor(Date.now() / 1000)),
    };
    return { kind: 'event', event };
  }

  if (!cmd) return { kind: 'skip' };
  // Other cmds (like / auth reply wrappers) — skip quietly; MSG_TYPE only if we care
  return { kind: 'skip', cmd };
}

export { CMD_DM, CMD_GIFT };
