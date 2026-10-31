import {
  DEFAULT_ROOM_CONFIG,
  type RoomConfig,
  type RoomConfigPartial,
} from '../types/config';

function configKey(roomId: string | number, appId: string | number): string {
  return `${roomId}:${appId}`;
}

function mergeConfig(base: RoomConfig, partial: RoomConfigPartial): RoomConfig {
  return {
    danmaku: { ...base.danmaku, ...(partial.danmaku ?? {}) },
    gift: { ...base.gift, ...(partial.gift ?? {}) },
  };
}

/** In-memory config store keyed by roomId+appId. Swap for DB later. */
export class ConfigStore {
  private readonly map = new Map<string, RoomConfig>();

  get(roomId: string | number, appId: string | number): RoomConfig {
    const key = configKey(roomId, appId);
    const existing = this.map.get(key);
    if (existing) return structuredClone(existing);
    const fresh = structuredClone(DEFAULT_ROOM_CONFIG);
    this.map.set(key, fresh);
    return structuredClone(fresh);
  }

  put(roomId: string | number, appId: string | number, partial: RoomConfigPartial): RoomConfig {
    const key = configKey(roomId, appId);
    const current = this.map.get(key) ?? structuredClone(DEFAULT_ROOM_CONFIG);
    const next = mergeConfig(current, partial);
    this.map.set(key, next);
    return structuredClone(next);
  }
}

export const configStore = new ConfigStore();
