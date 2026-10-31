import type { DanmakuEvent, GiftEvent } from '../types/events';

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
