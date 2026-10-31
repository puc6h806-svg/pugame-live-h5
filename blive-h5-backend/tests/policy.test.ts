import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM_CONFIG, type GiftConfig } from '../src/types/config';
import type { DanmakuEvent, GiftEvent } from '../src/types/events';
import { ConfigStore, normalizeKeywords, normalizeRoomConfig } from '../src/config/store';
import { roomConfigPatchSchema } from '../src/config/schema';
import { applyDanmakuPolicy, matchesKeyword } from '../src/gateway/danmakuPolicy';
import { GiftComboBuffer, ingestGift, type GiftComboScheduler } from '../src/gateway/giftCombo';
import { applyNoticeHook } from '../src/gateway/noticeHook';
import { parseInbound } from '../src/gateway/inbound';

function dm(text: string, extra: Partial<DanmakuEvent> = {}): DanmakuEvent {
  return {
    type: 'danmaku',
    id: 'd1',
    uid: 'u1',
    uname: 'n',
    msg: text,
    text,
    ts: 1,
    ...extra,
  };
}

function gift(partial: Partial<GiftEvent> = {}): GiftEvent {
  return {
    type: 'gift',
    id: 'g1',
    uid: 'u1',
    uname: 'n',
    giftId: 30000,
    giftName: '小花花',
    num: 1,
    price: 1000,
    ts: 1,
    ...partial,
  };
}

class ManualScheduler implements GiftComboScheduler {
  private handles: { fn: () => void; cleared: boolean }[] = [];

  set(fn: () => void, _ms: number): { fn: () => void; cleared: boolean } {
    const handle = { fn, cleared: false };
    this.handles.push(handle);
    return handle;
  }

  clear(handle: unknown): void {
    if (handle && typeof handle === 'object' && 'cleared' in handle) {
      (handle as { cleared: boolean }).cleared = true;
    }
  }

  get pending(): number {
    return this.handles.filter((h) => !h.cleared).length;
  }

  fire(): void {
    const batch = this.handles.filter((h) => !h.cleared);
    this.handles = [];
    for (const handle of batch) {
      if (!handle.cleared) handle.fn();
    }
  }
}

describe('blockKeywords / highlightKeywords', () => {
  const base = {
    ...DEFAULT_ROOM_CONFIG.danmaku,
    blockKeywords: ['广告', 'spam'],
    highlightKeywords: ['你好', 'VIP'],
  };

  it('matches msg substrings case-insensitively and ignores blanks', () => {
    assert.equal(matchesKeyword('这是广告单', ['广告']), true);
    assert.equal(matchesKeyword('Hello SPAM world', ['spam']), true);
    assert.equal(matchesKeyword('Hello', ['ell']), true);
    assert.equal(matchesKeyword('Hello', ['', '   ']), false);
    assert.equal(matchesKeyword('你好', ['再见']), false);
  });

  it('drops blocked danmaku and does not emit an error event', () => {
    assert.equal(applyDanmakuPolicy(dm('点击广告'), base), null);
    assert.equal(applyDanmakuPolicy(dm('buy SPAMmer'), base), null);
    const kept = applyDanmakuPolicy(dm('普通弹幕'), base);
    assert.ok(kept);
    assert.equal(kept.highlight, undefined);
    assert.equal(kept.msg, '普通弹幕');
    assert.equal(kept.text, '普通弹幕');
  });

  it('sets highlight when a keyword hits and block wins over highlight', () => {
    const hit = applyDanmakuPolicy(dm('你好呀'), base);
    assert.equal(hit?.highlight, true);
    assert.equal(hit?.text, '你好呀');
    assert.equal(applyDanmakuPolicy(dm('你好广告'), base), null);
  });

  it('default config does not drop or highlight ordinary danmaku', () => {
    const out = applyDanmakuPolicy(dm('hello', { avatar: 'http://a' }), DEFAULT_ROOM_CONFIG.danmaku);
    assert.equal(out?.msg, 'hello');
    assert.equal(out?.text, 'hello');
    assert.equal(out?.highlight, undefined);
    assert.equal(out?.avatar, 'http://a');
  });

  it('showAvatar=false strips avatar; disabled drops the event', () => {
    const hidden = applyDanmakuPolicy(dm('hi', { avatar: 'http://a' }), {
      ...DEFAULT_ROOM_CONFIG.danmaku,
      showAvatar: false,
    });
    assert.equal(hidden?.avatar, undefined);
    assert.equal(applyDanmakuPolicy(dm('hi'), { ...DEFAULT_ROOM_CONFIG.danmaku, enabled: false }), null);
  });
});

describe('gift combo window', () => {
  it('comboWindowMs=0 pushes each gift immediately without combo', () => {
    const emitted: GiftEvent[] = [];
    const sched = new ManualScheduler();
    const buffer = new GiftComboBuffer((ev) => emitted.push(ev), sched);
    buffer.push(7, gift({ id: 'a', num: 1, ts: 1 }), 0);
    buffer.push(7, gift({ id: 'b', num: 4, ts: 2, price: 2000 }), 0);
    assert.equal(sched.pending, 0);
    assert.equal(emitted.length, 2);
    assert.equal(emitted[0].id, 'a');
    assert.equal(emitted[0].num, 1);
    assert.equal(emitted[0].combo, undefined);
    assert.equal(emitted[1].price, 2000);
    assert.equal(emitted[1].combo, undefined);
  });

  it('sums num for the same roomId+uid+giftId and keeps latest id/ts and unit price', () => {
    const emitted: GiftEvent[] = [];
    const sched = new ManualScheduler();
    const buffer = new GiftComboBuffer((ev) => emitted.push(ev), sched);
    buffer.push(7, gift({ id: 'a', uid: 'u1', giftId: 3, num: 2, price: 1000, ts: 10 }), 3000);
    buffer.push(
      7,
      gift({ id: 'b', uid: 'u1', giftId: 3, num: 5, price: 1000, ts: 11, uname: 'later' }),
      3000,
    );
    assert.equal(emitted.length, 0);
    assert.equal(sched.pending, 1);
    sched.fire();
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].id, 'b');
    assert.equal(emitted[0].ts, 11);
    assert.equal(emitted[0].uname, 'later');
    assert.equal(emitted[0].num, 7);
    assert.equal(emitted[0].price, 1000);
    assert.equal(emitted[0].combo, 7);
  });

  it('does not merge across uid, giftId, or roomId', () => {
    const emitted: GiftEvent[] = [];
    const sched = new ManualScheduler();
    const buffer = new GiftComboBuffer((ev) => emitted.push(ev), sched);
    buffer.push(1, gift({ id: 'a', uid: 'u1', giftId: 3, num: 1 }), 3000);
    buffer.push(1, gift({ id: 'b', uid: 'u2', giftId: 3, num: 1 }), 3000);
    buffer.push(1, gift({ id: 'c', uid: 'u1', giftId: 4, num: 1 }), 3000);
    buffer.push(2, gift({ id: 'd', uid: 'u1', giftId: 3, num: 1 }), 3000);
    assert.equal(sched.pending, 4);
    sched.fire();
    assert.equal(emitted.length, 4);
    assert.deepEqual(
      emitted.map((ev) => ev.id),
      ['a', 'b', 'c', 'd'],
    );
    for (const ev of emitted) assert.equal(ev.combo, undefined);
  });

  it('single gift in a window omits combo', () => {
    const emitted: GiftEvent[] = [];
    const sched = new ManualScheduler();
    const buffer = new GiftComboBuffer((ev) => emitted.push(ev), sched);
    buffer.push(1, gift({ num: 3 }), 3000);
    sched.fire();
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].num, 3);
    assert.equal(emitted[0].combo, undefined);
  });

  it('gates on enabled and minPrice before buffering', () => {
    const emitted: GiftEvent[] = [];
    const sched = new ManualScheduler();
    const buffer = new GiftComboBuffer((ev) => emitted.push(ev), sched);
    const cfg: GiftConfig = { ...DEFAULT_ROOM_CONFIG.gift, minPrice: 1000, comboWindowMs: 0 };
    ingestGift(buffer, 9, gift({ price: 999, id: 'cheap' }), cfg);
    ingestGift(buffer, 9, gift({ price: 1000, id: 'ok', num: 2 }), cfg);
    ingestGift(buffer, 9, gift({ price: 5000, id: 'off' }), { ...cfg, enabled: false });
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].id, 'ok');
    assert.equal(emitted[0].num, 2);
    assert.equal(emitted[0].price, 1000);
  });
});

describe('config defaults and keyword cap', () => {
  it('fills Slice A/B defaults while keeping legacy fields', () => {
    const store = new ConfigStore();
    const next = store.put('42', '7', {
      danmaku: { enabled: false, maxLines: 50, showAvatar: false },
      gift: { minPrice: 1000, durationMs: 2500 },
    });
    assert.equal(next.danmaku.enabled, false);
    assert.equal(next.danmaku.maxLines, 50);
    assert.equal(next.danmaku.showAvatar, false);
    assert.equal(next.danmaku.fontSize, 14);
    assert.equal(next.danmaku.opacity, 1);
    assert.equal(next.danmaku.enterMs, 300);
    assert.deepEqual(next.danmaku.highlightKeywords, []);
    assert.deepEqual(next.danmaku.blockKeywords, []);
    assert.equal(next.gift.enabled, true);
    assert.equal(next.gift.minPrice, 1000);
    assert.equal(next.gift.durationMs, 2500);
    assert.equal(next.gift.comboWindowMs, 3000);
    assert.equal(next.layout.wallPosition, 'right');
    assert.equal(next.layout.giftAnchor, 'center');
    assert.deepEqual(next.notice, { enterEnabled: false, guardEnabled: false, scEnabled: false });
  });

  it('fresh rooms use MVP defaults (maxLines 8, durationMs 3000, combo 3000)', () => {
    const fresh = new ConfigStore().get(1, 'app');
    assert.deepEqual(fresh, DEFAULT_ROOM_CONFIG);
  });

  it('caps keywords at 20, dedupes case-insensitively, and keeps a partial update', () => {
    assert.equal(normalizeKeywords([' Foo ', 'foo', '', '  ', 'bar']).join(','), 'Foo,bar');
    const store = new ConfigStore();
    const many = Array.from({ length: 25 }, (_, i) => `k${i}`);
    store.put(1, 'app', {
      danmaku: { blockKeywords: many, highlightKeywords: ['Hi', 'hi'] },
      notice: { scEnabled: true },
      layout: { wallPosition: 'bottom' },
    });
    const kept = store.put(1, 'app', { danmaku: { fontSize: 18 } });
    assert.equal(kept.danmaku.blockKeywords.length, 20);
    assert.deepEqual(kept.danmaku.highlightKeywords, ['Hi']);
    assert.equal(kept.danmaku.fontSize, 18);
    assert.equal(kept.danmaku.enabled, true);
    assert.equal(kept.notice.scEnabled, true);
    assert.equal(kept.notice.enterEnabled, false);
    assert.equal(kept.layout.wallPosition, 'bottom');
    assert.equal(kept.layout.giftAnchor, 'center');
  });

  it('rejects more than 20 keywords and out-of-range opacity at the API schema', () => {
    const many = Array.from({ length: 21 }, (_, i) => `k${i}`);
    assert.equal(roomConfigPatchSchema.safeParse({ danmaku: { blockKeywords: many } }).success, false);
    assert.equal(roomConfigPatchSchema.safeParse({ danmaku: { opacity: 1.2 } }).success, false);
    assert.equal(roomConfigPatchSchema.safeParse({ gift: { comboWindowMs: 0 } }).success, true);
    assert.equal(
      roomConfigPatchSchema.safeParse({ layout: { wallPosition: 'left', giftAnchor: 'top' } }).success,
      true,
    );
    const clamped = normalizeRoomConfig({ danmaku: { opacity: 2, fontSize: 1 }, notice: { enterEnabled: false } });
    assert.equal(clamped.danmaku.opacity, 1);
    assert.equal(clamped.danmaku.fontSize, 8);
    assert.equal(clamped.notice.enterEnabled, false);
  });
});

describe('P2 notice hook', () => {
  it('default flags ignore notice cmds and do not error', () => {
    assert.deepEqual(applyNoticeHook('LIVE_OPEN_PLATFORM_SUPER_CHAT', DEFAULT_ROOM_CONFIG.notice), {
      action: 'ignore',
      kind: 'sc',
    });
    assert.deepEqual(applyNoticeHook('LIVE_OPEN_PLATFORM_GUARD', DEFAULT_ROOM_CONFIG.notice), {
      action: 'ignore',
      kind: 'guard',
    });
    assert.deepEqual(applyNoticeHook('LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER', DEFAULT_ROOM_CONFIG.notice), {
      action: 'ignore',
      kind: 'enter',
    });
    assert.deepEqual(applyNoticeHook('LIVE_OPEN_PLATFORM_DM', DEFAULT_ROOM_CONFIG.notice), {
      action: 'not_notice',
    });
  });

  it('enabled flag stays a no-emit placeholder', () => {
    const result = applyNoticeHook('LIVE_OPEN_PLATFORM_GUARD', {
      enterEnabled: false,
      guardEnabled: true,
      scEnabled: false,
    });
    assert.deepEqual(result, { action: 'reserved', kind: 'guard' });
  });
});

describe('inbound auth / config.set', () => {
  it('parses auth and config.set, ignores unknown frames', () => {
    assert.deepEqual(parseInbound({ type: 'auth', token: ' abc ', plug_env: '1' }), {
      type: 'auth',
      token: 'abc',
      plugEnv: 1,
    });
    const set = parseInbound({
      type: 'config.set',
      gift: { comboWindowMs: 0 },
      layout: { wallPosition: 'left' },
    });
    assert.equal(set.type, 'config.set');
    if (set.type !== 'config.set') return;
    assert.equal(set.patch.gift?.comboWindowMs, 0);
    assert.equal(set.patch.layout?.wallPosition, 'left');
    assert.deepEqual(parseInbound({ type: 'config.set', danmaku: { opacity: 3 } }), {
      type: 'invalid',
      code: 'INTERNAL',
    });
    assert.deepEqual(parseInbound({ type: 'auth', token: '  ' }), { type: 'invalid', code: 'UNAUTHORIZED' });
    assert.deepEqual(parseInbound({ type: 'ping' }), { type: 'ignore' });
  });
});
