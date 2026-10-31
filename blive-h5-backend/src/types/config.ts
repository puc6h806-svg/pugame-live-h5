export type WallPosition = 'left' | 'right' | 'bottom';
export type GiftAnchor = 'center' | 'top' | 'bottom';

export interface DanmakuConfig {
  enabled: boolean;
  /** Visible lines. Default 8 (aligned with the H5 MVP). */
  maxLines: number;
  showAvatar: boolean;
  /** CSS px. Default 14. */
  fontSize: number;
  /** 0–1. Default 1. */
  opacity: number;
  /** Enter animation duration. Default 300. */
  enterMs: number;
  /** Case-insensitive substring match on msg/text. Hit → danmaku.highlight=true. Max 20. */
  highlightKeywords: string[];
  /** Case-insensitive substring match. Hit → drop before enqueue. Max 20. */
  blockKeywords: string[];
}

export interface GiftConfig {
  enabled: boolean;
  /** Minimum gift price (official integer units) to show; 0 = all. */
  minPrice: number;
  /** Display duration. Default 3000. */
  durationMs: number;
  /**
   * Server-side combo window for the same roomId+uid+giftId.
   * Default 3000. 0 = push each gift immediately (no merge).
   */
  comboWindowMs: number;
}

export interface LayoutConfig {
  wallPosition: WallPosition;
  giftAnchor: GiftAnchor;
}

/** P2 reserved switches. Default all false — do not emit those cmds. */
export interface NoticeConfig {
  enterEnabled: boolean;
  guardEnabled: boolean;
  scEnabled: boolean;
}

export interface RoomConfig {
  danmaku: DanmakuConfig;
  gift: GiftConfig;
  layout: LayoutConfig;
  notice: NoticeConfig;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  danmaku: {
    enabled: true,
    maxLines: 8,
    showAvatar: true,
    fontSize: 14,
    opacity: 1,
    enterMs: 300,
    highlightKeywords: [],
    blockKeywords: [],
  },
  gift: {
    enabled: true,
    minPrice: 0,
    durationMs: 3000,
    comboWindowMs: 3000,
  },
  layout: {
    wallPosition: 'right',
    giftAnchor: 'center',
  },
  notice: {
    enterEnabled: false,
    guardEnabled: false,
    scEnabled: false,
  },
};

export type RoomConfigPartial = {
  danmaku?: Partial<DanmakuConfig>;
  gift?: Partial<GiftConfig>;
  layout?: Partial<LayoutConfig>;
  notice?: Partial<NoticeConfig>;
};
