export interface DanmakuConfig {
  enabled: boolean;
  maxLines: number;
  showAvatar: boolean;
}

export interface GiftConfig {
  enabled: boolean;
  /** Minimum gift price (official integer units) to show; 0 = all. */
  minPrice: number;
  durationMs: number;
}

export interface RoomConfig {
  danmaku: DanmakuConfig;
  gift: GiftConfig;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  danmaku: {
    enabled: true,
    maxLines: 50,
    showAvatar: true,
  },
  gift: {
    enabled: true,
    minPrice: 0,
    durationMs: 4000,
  },
};

export type RoomConfigPartial = {
  danmaku?: Partial<DanmakuConfig>;
  gift?: Partial<GiftConfig>;
};
