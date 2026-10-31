import type { GiftConfig } from '../types/config';
import type { GiftEvent } from '../types/events';

export interface GiftComboScheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const defaultScheduler: GiftComboScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface BufferedGift {
  event: GiftEvent;
  sources: number;
  timer: unknown;
}

/**
 * Combo key is roomId+uid+giftId.
 * Window starts at the first accepted gift and is not reset by later gifts
 * (delay is bounded by comboWindowMs). On flush, num is the sum, id/ts/price
 * come from the latest gift, price stays the unit price.
 * comboWindowMs <= 0 emits each gift immediately with no `combo` field.
 */
export class GiftComboBuffer {
  private readonly pending = new Map<string, BufferedGift>();

  constructor(
    private readonly emit: (event: GiftEvent) => void,
    private readonly scheduler: GiftComboScheduler = defaultScheduler,
  ) {}

  static key(roomId: number, uid: string, giftId: number): string {
    return `${roomId}:${uid}:${giftId}`;
  }

  push(roomId: number, event: GiftEvent, windowMs: number): void {
    if (!(windowMs > 0)) {
      this.emit(withoutCombo(event));
      return;
    }

    const key = GiftComboBuffer.key(roomId, event.uid, event.giftId);
    const existing = this.pending.get(key);
    if (!existing) {
      const timer = this.scheduler.set(() => this.flushKey(key), windowMs);
      this.pending.set(key, {
        event: withoutCombo(event),
        sources: 1,
        timer,
      });
      return;
    }

    existing.event = withoutCombo({
      ...event,
      num: existing.event.num + event.num,
      price: event.price,
    });
    existing.sources += 1;
  }

  flushAll(): void {
    for (const key of [...this.pending.keys()]) {
      this.flushKey(key);
    }
  }

  dispose(): void {
    for (const item of this.pending.values()) {
      this.scheduler.clear(item.timer);
    }
    this.pending.clear();
  }

  private flushKey(key: string): void {
    const item = this.pending.get(key);
    if (!item) return;
    this.pending.delete(key);
    this.scheduler.clear(item.timer);
    const out: GiftEvent = { ...item.event };
    if (item.sources > 1) out.combo = out.num;
    else delete out.combo;
    this.emit(out);
  }
}

function withoutCombo(event: GiftEvent): GiftEvent {
  if (event.combo == null) return { ...event };
  const out = { ...event };
  delete out.combo;
  return out;
}

/** enabled + minPrice gate. Rejected gifts are not buffered and not pushed. */
export function ingestGift(
  buffer: GiftComboBuffer,
  roomId: number,
  event: GiftEvent,
  cfg: GiftConfig,
): void {
  if (!cfg.enabled) return;
  if (event.price < cfg.minPrice) return;
  buffer.push(roomId, event, cfg.comboWindowMs);
}
