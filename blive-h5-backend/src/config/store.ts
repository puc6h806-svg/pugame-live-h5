import {
  DEFAULT_ROOM_CONFIG,
  type GiftAnchor,
  type NoticeConfig,
  type RoomConfig,
  type RoomConfigPartial,
  type WallPosition,
} from '../types/config';

function configKey(roomId: string | number, appId: string | number): string {
  return `${roomId}:${appId}`;
}

const KEYWORD_MAX = 20;
const KEYWORD_LEN = 64;

/** Trim, drop blanks / over-long items, case-insensitive dedupe, cap at 20. */
export function normalizeKeywords(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s || s.length > KEYWORD_LEN) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= KEYWORD_MAX) break;
  }
  return out;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const i = Math.trunc(v);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function clampUnit(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asWall(v: unknown, fallback: WallPosition): WallPosition {
  return v === 'left' || v === 'right' || v === 'bottom' ? v : fallback;
}

function asAnchor(v: unknown, fallback: GiftAnchor): GiftAnchor {
  return v === 'center' || v === 'top' || v === 'bottom' ? v : fallback;
}

/**
 * Fill defaults and clamp ranges.
 * Pass an already-merged object: omitted fields must already be copied from the previous config.
 * Missing notice flags stay false (P2 off).
 */
export function normalizeRoomConfig(input?: RoomConfigPartial | RoomConfig): RoomConfig {
  const d = DEFAULT_ROOM_CONFIG;
  const danmaku = input?.danmaku ?? {};
  const gift = input?.gift ?? {};
  const layout = input?.layout ?? {};
  const notice = input?.notice ?? {};

  const noticeOut: NoticeConfig = {
    enterEnabled: notice.enterEnabled === true,
    guardEnabled: notice.guardEnabled === true,
    scEnabled: notice.scEnabled === true,
  };

  return {
    danmaku: {
      enabled: asBool(danmaku.enabled, d.danmaku.enabled),
      maxLines: clampInt(danmaku.maxLines, 1, 200, d.danmaku.maxLines),
      showAvatar: asBool(danmaku.showAvatar, d.danmaku.showAvatar),
      fontSize: clampInt(danmaku.fontSize, 8, 96, d.danmaku.fontSize),
      opacity: clampUnit(danmaku.opacity, d.danmaku.opacity),
      enterMs: clampInt(danmaku.enterMs, 0, 10_000, d.danmaku.enterMs),
      highlightKeywords: normalizeKeywords(danmaku.highlightKeywords ?? d.danmaku.highlightKeywords),
      blockKeywords: normalizeKeywords(danmaku.blockKeywords ?? d.danmaku.blockKeywords),
    },
    gift: {
      enabled: asBool(gift.enabled, d.gift.enabled),
      minPrice: clampInt(gift.minPrice, 0, Number.MAX_SAFE_INTEGER, d.gift.minPrice),
      durationMs: clampInt(gift.durationMs, 1, 120_000, d.gift.durationMs),
      comboWindowMs: clampInt(gift.comboWindowMs, 0, 60_000, d.gift.comboWindowMs),
    },
    layout: {
      wallPosition: asWall(layout.wallPosition, d.layout.wallPosition),
      giftAnchor: asAnchor(layout.giftAnchor, d.layout.giftAnchor),
    },
    notice: noticeOut,
  };
}

function mergeConfig(base: RoomConfig, partial: RoomConfigPartial): RoomConfig {
  return normalizeRoomConfig({
    danmaku: { ...base.danmaku, ...(partial.danmaku ?? {}) },
    gift: { ...base.gift, ...(partial.gift ?? {}) },
    layout: { ...base.layout, ...(partial.layout ?? {}) },
    notice: { ...base.notice, ...(partial.notice ?? {}) },
  });
}

/** In-memory config store keyed by roomId+appId. Swap for DB later. */
export class ConfigStore {
  private readonly map = new Map<string, RoomConfig>();

  get(roomId: string | number, appId: string | number): RoomConfig {
    const key = configKey(roomId, appId);
    const existing = this.map.get(key);
    const normalized = normalizeRoomConfig(existing ?? DEFAULT_ROOM_CONFIG);
    this.map.set(key, normalized);
    return structuredClone(normalized);
  }

  put(roomId: string | number, appId: string | number, partial: RoomConfigPartial): RoomConfig {
    const key = configKey(roomId, appId);
    const current = this.map.get(key) ?? structuredClone(DEFAULT_ROOM_CONFIG);
    const next = mergeConfig(normalizeRoomConfig(current), partial);
    this.map.set(key, next);
    return structuredClone(next);
  }
}

export const configStore = new ConfigStore();
