import { roomConfigPatchSchema, toRoomConfigPartial } from '../config/schema';
import type { RoomConfigPartial } from '../types/config';
import type { PlugEnv } from '../types/events';

export type InboundMessage =
  | { type: 'auth'; token: string; plugEnv?: PlugEnv }
  | { type: 'config.set'; patch: RoomConfigPartial }
  | { type: 'invalid'; code: 'UNAUTHORIZED' | 'INTERNAL' }
  | { type: 'ignore' };

export function parsePlugEnv(v: unknown): PlugEnv | undefined {
  if (v === 0 || v === '0') return 0;
  if (v === 1 || v === '1') return 1;
  return undefined;
}

/** Frontend → server text frames: `auth` and `config.set`. Unknown types are ignored. */
export function parseInbound(raw: unknown): InboundMessage {
  if (!raw || typeof raw !== 'object') return { type: 'ignore' };
  const rec = raw as Record<string, unknown>;

  if (rec.type === 'auth') {
    if (typeof rec.token !== 'string' || !rec.token.trim()) {
      return { type: 'invalid', code: 'UNAUTHORIZED' };
    }
    return {
      type: 'auth',
      token: rec.token.trim(),
      plugEnv: parsePlugEnv(rec.plugEnv ?? rec.plug_env),
    };
  }

  if (rec.type === 'config.set') {
    const parsed = roomConfigPatchSchema.safeParse(rec);
    if (!parsed.success) return { type: 'invalid', code: 'INTERNAL' };
    return { type: 'config.set', patch: toRoomConfigPartial(parsed.data) };
  }

  return { type: 'ignore' };
}
