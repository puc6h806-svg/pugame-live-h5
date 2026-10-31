import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCmd } from '../src/bili/events';
import { decodePackets, encodeAuth, encodeHeartbeat, OP_AUTH, OP_HEARTBEAT } from '../src/bili/wsProto';
import zlib from 'zlib';

describe('normalizeCmd', () => {
  it('maps LIVE_OPEN_PLATFORM_DM to danmaku with open_id as uid', () => {
    const result = normalizeCmd({
      cmd: 'LIVE_OPEN_PLATFORM_DM',
      data: {
        msg_id: 'm1',
        open_id: 'oid-abc',
        uid: 0,
        uname: '测试用户',
        msg: '你好',
        uface: 'https://example.com/a.png',
        timestamp: 1700000000,
      },
    });
    assert.equal(result.kind, 'event');
    if (result.kind !== 'event') return;
    assert.equal(result.event.type, 'danmaku');
    if (result.event.type !== 'danmaku') return;
    assert.equal(result.event.id, 'm1');
    assert.equal(result.event.uid, 'oid-abc');
    assert.equal(result.event.uname, '测试用户');
    assert.equal(result.event.msg, '你好');
    assert.equal(result.event.text, '你好');
    assert.equal(result.event.highlight, undefined);
    assert.equal(result.event.identity, undefined);
    assert.equal(result.event.avatar, 'https://example.com/a.png');
    assert.equal(result.event.ts, 1700000000);
  });

  it('maps LIVE_OPEN_PLATFORM_SEND_GIFT with price passthrough (1000=1元)', () => {
    const result = normalizeCmd({
      cmd: 'LIVE_OPEN_PLATFORM_SEND_GIFT',
      data: {
        msg_id: 'g1',
        open_id: 'oid-gift',
        uname: '土豪',
        gift_id: 30000,
        gift_name: '小花花',
        gift_num: 5,
        price: 1000,
        timestamp: 1700000001,
      },
    });
    assert.equal(result.kind, 'event');
    if (result.kind !== 'event') return;
    assert.equal(result.event.type, 'gift');
    if (result.event.type !== 'gift') return;
    assert.equal(result.event.giftId, 30000);
    assert.equal(result.event.giftName, '小花花');
    assert.equal(result.event.num, 5);
    assert.equal(result.event.price, 1000);
    assert.equal(result.event.uid, 'oid-gift');
    assert.equal(result.event.combo, undefined);
  });

  it('skips unrelated and reserved notice cmds without error', () => {
    for (const cmd of [
      'LIVE_OPEN_PLATFORM_LIKE',
      'LIVE_OPEN_PLATFORM_LIVE_ROOM_ENTER',
      'LIVE_OPEN_PLATFORM_GUARD',
      'LIVE_OPEN_PLATFORM_SUPER_CHAT',
    ]) {
      const result = normalizeCmd({ cmd, data: {} });
      assert.equal(result.kind, 'skip', cmd);
    }
  });
});

function danmakuFrom(data: Record<string, unknown>, msg = '你好') {
  const result = normalizeCmd({
    cmd: 'LIVE_OPEN_PLATFORM_DM',
    data: {
      msg_id: 'id-1',
      open_id: 'oid',
      uname: '用户',
      msg,
      timestamp: 1700000000,
      ...data,
    },
  });
  assert.equal(result.kind, 'event');
  if (result.kind !== 'event') throw new Error('expected event');
  assert.equal(result.event.type, 'danmaku');
  if (result.event.type !== 'danmaku') throw new Error('expected danmaku');
  assert.equal(result.event.msg, msg);
  assert.equal(result.event.text, msg);
  assert.equal(result.event.highlight, undefined);
  return result.event;
}

describe('danmaku identity', () => {
  const plain = {
    is_admin: 0,
    guard_level: 0,
    fans_medal_wearing_status: false,
    fans_medal_level: 0,
  };

  it('maps is_admin 1 or other truthy values to admin, above guard and medal', () => {
    const topped = danmakuFrom({
      ...plain,
      is_admin: 1,
      guard_level: 1,
      fans_medal_wearing_status: true,
      fans_medal_level: 21,
    });
    assert.equal(topped.identity, 'admin');
    assert.equal(danmakuFrom({ ...plain, is_admin: true }).identity, 'admin');
    assert.equal(danmakuFrom({ ...plain, is_admin: '1' }).identity, 'admin');
    assert.equal(danmakuFrom({ ...plain, is_admin: 2 }).identity, 'admin');
  });

  it('maps guard_level 1|2|3 to guard when the sender is not an admin', () => {
    for (const guard_level of [1, 2, 3, '1', '2', '3']) {
      const event = danmakuFrom({
        ...plain,
        guard_level,
        fans_medal_wearing_status: true,
        fans_medal_level: 10,
      });
      assert.equal(event.identity, 'guard', String(guard_level));
    }
    assert.equal(danmakuFrom({ ...plain, guard_level: 0 }).identity, 'normal');
    assert.equal(danmakuFrom({ ...plain, guard_level: 4 }).identity, 'normal');
  });

  it('maps a worn fans medal with level > 0 to member', () => {
    const event = danmakuFrom({
      ...plain,
      fans_medal_wearing_status: true,
      fans_medal_level: 6,
    });
    assert.equal(event.identity, 'member');
    assert.equal(
      danmakuFrom({ ...plain, fans_medal_wearing_status: true, fans_medal_level: '12' }).identity,
      'member',
    );
    assert.equal(
      danmakuFrom({ ...plain, fans_medal_wearing_status: true, fans_medal_level: 0 }).identity,
      'normal',
    );
    assert.equal(
      danmakuFrom({ ...plain, fans_medal_wearing_status: false, fans_medal_level: 20 }).identity,
      'normal',
    );
  });

  it('maps a ruled-out sender to normal and still emits msg and text', () => {
    const event = danmakuFrom(plain, '普通弹幕');
    assert.equal(event.identity, 'normal');
    assert.equal(event.msg, '普通弹幕');
    assert.equal(event.text, '普通弹幕');
    assert.equal(danmakuFrom({ ...plain, is_admin: false }).identity, 'normal');
    assert.equal(danmakuFrom({ ...plain, is_admin: '0' }).identity, 'normal');
  });

  it('keeps a lower role when the higher fields are absent', () => {
    assert.equal(danmakuFrom({ is_admin: 1 }).identity, 'admin');
    assert.equal(danmakuFrom({ guard_level: 1 }).identity, 'guard');
    assert.equal(danmakuFrom({ guard_level: 2, fans_medal_wearing_status: true, fans_medal_level: 5 }).identity, 'guard');
    assert.equal(
      danmakuFrom({ fans_medal_wearing_status: true, fans_medal_level: 5 }).identity,
      'member',
    );
    assert.equal(
      danmakuFrom({ is_admin: 0, fans_medal_wearing_status: true, fans_medal_level: 5 }).identity,
      'member',
    );
  });

  it('omits identity when normal cannot be proven, and keeps the danmaku', () => {
    assert.equal(danmakuFrom({}).identity, undefined);
    assert.equal(
      danmakuFrom({ guard_level: 0, fans_medal_wearing_status: false, fans_medal_level: 0 }).identity,
      undefined,
    );
    assert.equal(
      danmakuFrom({ is_admin: 0, fans_medal_wearing_status: false, fans_medal_level: 0 }).identity,
      undefined,
    );
    assert.equal(
      danmakuFrom({ is_admin: 0, guard_level: 0, fans_medal_wearing_status: true }).identity,
      undefined,
    );
    assert.equal(danmakuFrom({ is_admin: 0, guard_level: 0, fans_medal_level: 8 }).identity, undefined);
    assert.equal(danmakuFrom({ ...plain, is_admin: 'yes' }).identity, undefined);
    assert.equal(danmakuFrom({ ...plain, guard_level: 'nope' }).identity, undefined);
  });
});

describe('wsProto', () => {
  it('encodes OP_AUTH and OP_HEARTBEAT', () => {
    const auth = encodeAuth('{"test":1}');
    assert.equal(auth.readInt32BE(8), OP_AUTH);
    const hb = encodeHeartbeat();
    assert.equal(hb.readInt32BE(8), OP_HEARTBEAT);
    assert.equal(hb.readUInt32BE(0), 16);
  });

  it('recursively unpacks zlib Version=2 multi-packet bodies', () => {
    // Build two nested plaintext packets, compress as version=2 body
    const inner1 = encodeAuth('{"cmd":"A"}');
    const inner2 = encodeHeartbeat();
    const combined = Buffer.concat([inner1, inner2]);
    const compressed = zlib.deflateSync(combined);

    const outerLen = 16 + compressed.length;
    const outer = Buffer.alloc(outerLen);
    outer.writeUInt32BE(outerLen, 0);
    outer.writeUInt16BE(16, 4);
    outer.writeUInt16BE(2, 6); // version 2
    outer.writeInt32BE(5, 8); // OP_SEND_SMS_REPLY
    outer.writeInt32BE(1, 12);
    compressed.copy(outer, 16);

    const packets = decodePackets(outer);
    assert.ok(packets.length >= 2);
    assert.equal(packets[0].operation, OP_AUTH);
    assert.equal(packets[1].operation, OP_HEARTBEAT);
  });
});
