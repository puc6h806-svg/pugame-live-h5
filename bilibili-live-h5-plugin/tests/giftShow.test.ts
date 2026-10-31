import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GIFT_COMBO_WINDOW_MS,
  GIFT_QUEUE_GAP_MS,
  createGiftShow,
  type GiftCard,
} from '../src/lib/giftShow.ts'

interface Gift {
  id: string
  uid: string
  giftId: number
  num: number
  uname: string
}

function createHarness(duration = 1000) {
  let t = 0
  const q: { at: number; fn: () => void; dead: boolean }[] = []
  const shown: (GiftCard<Gift> | null)[] = []
  const consumed: string[][] = []
  let current: GiftCard<Gift> | null = null

  const clock = {
    now: () => t,
    later(ms: number, fn: () => void) {
      const item = { at: t + ms, fn, dead: false }
      q.push(item)
      return () => {
        item.dead = true
      }
    },
    advance(ms: number) {
      const target = t + ms
      for (;;) {
        let idx = -1
        for (let i = 0; i < q.length; i++) {
          const item = q[i]
          if (!item || item.dead) continue
          if (item.at <= target && (idx === -1 || item.at < q[idx]!.at)) idx = i
        }
        if (idx === -1) break
        const item = q[idx]!
        q.splice(idx, 1)
        t = item.at
        item.fn()
      }
      t = target
    },
  }

  const show = createGiftShow<Gift>({
    now: clock.now,
    durationMs: () => duration,
    later: clock.later,
    onShow(card) {
      current = card
      shown.push(card)
    },
    onConsumed(ids) {
      consumed.push(ids.slice())
    },
  })

  return {
    show,
    clock,
    shown,
    consumed,
    get current() {
      return current
    },
  }
}

function gift(partial: Partial<Gift> & Pick<Gift, 'id'>): Gift {
  return {
    uid: 'u1',
    giftId: 1,
    num: 1,
    uname: '小明',
    ...partial,
  }
}

test('same user and gift merge on screen and refresh duration', () => {
  const h = createHarness(1000)
  h.show.push(gift({ id: 'a', num: 1 }))
  assert.equal(h.current?.gift.num, 1)
  assert.equal(h.current?.hits, 1)

  h.clock.advance(700)
  h.show.push(gift({ id: 'b', num: 2 }))
  assert.equal(h.current?.key, 'a')
  assert.equal(h.current?.gift.num, 3)
  assert.equal(h.current?.hits, 2)
  assert.equal(h.current?.bump, 2)
  assert.equal(h.consumed.length, 0)

  h.clock.advance(300)
  assert.equal(h.current?.gift.num, 3, 'original deadline must not unmount a refreshed combo')

  h.clock.advance(700)
  assert.equal(h.current, null)
  assert.deepEqual(h.consumed, [['a', 'b']])
})

test('different gifts stay one at a time with a gap of at least 300ms', () => {
  const h = createHarness(800)
  h.show.push(gift({ id: 'a', giftId: 1 }))
  h.show.push(gift({ id: 'b', uid: 'u2', giftId: 2 }))
  assert.equal(h.current?.key, 'a')

  h.clock.advance(800)
  assert.equal(h.current, null)
  h.show.release()
  assert.equal(h.current, null, 'next effect waits out the queue gap')

  h.clock.advance(GIFT_QUEUE_GAP_MS - 1)
  assert.equal(h.current, null)
  h.clock.advance(1)
  assert.equal(h.current?.key, 'b')
  assert.equal(h.shown.filter((card) => card !== null).length, 2)
})

test('queued same-gift hits inside the combo window collapse to one card', () => {
  const h = createHarness(1000)
  h.show.push(gift({ id: 'hold', uid: 'other', giftId: 9 }))
  h.show.push(gift({ id: 'c1', num: 1 }))
  h.clock.advance(500)
  h.show.push(gift({ id: 'c2', num: 4 }))
  assert.ok(500 <= GIFT_COMBO_WINDOW_MS)
  assert.equal(h.current?.key, 'hold')

  h.clock.advance(500)
  h.show.release()
  h.clock.advance(GIFT_QUEUE_GAP_MS)
  assert.equal(h.current?.gift.num, 5)
  assert.equal(h.current?.hits, 2)
  assert.deepEqual(h.current?.ids, ['c1', 'c2'])
})

test('same gift outside the combo window stays a separate queued card', () => {
  const h = createHarness(3000)
  h.show.push(gift({ id: 'hold', uid: 'other', giftId: 9 }))
  h.show.push(gift({ id: 'c1' }))
  h.clock.advance(GIFT_COMBO_WINDOW_MS + 50)
  h.show.push(gift({ id: 'c2' }))

  h.clock.advance(3000 - (GIFT_COMBO_WINDOW_MS + 50))
  h.show.release()
  h.clock.advance(GIFT_QUEUE_GAP_MS)
  assert.equal(h.current?.gift.num, 1)
  assert.deepEqual(h.current?.ids, ['c1'])

  h.clock.advance(3000)
  h.show.release()
  h.clock.advance(GIFT_QUEUE_GAP_MS)
  assert.deepEqual(h.current?.ids, ['c2'])
})

test('a visible slot is never replaced without an empty frame', () => {
  const h = createHarness(1000)
  h.show.push(gift({ id: 'a', giftId: 1 }))
  h.show.push(gift({ id: 'a2', giftId: 1, num: 3 }))
  h.show.push(gift({ id: 'b', giftId: 2, uid: 'u2' }))
  h.clock.advance(1000)
  h.show.release()
  h.clock.advance(GIFT_QUEUE_GAP_MS)

  let currentKey: string | null = null
  for (const card of h.shown) {
    if (!card) {
      currentKey = null
      continue
    }
    if (currentKey && card.key !== currentKey) {
      assert.fail(`slot ${currentKey} replaced by ${card.key} without a gap`)
    }
    currentKey = card.key
  }
  assert.equal(h.current?.key, 'b')
})

test('clear drops the slot and reports every id', () => {
  const h = createHarness(3000)
  h.show.push(gift({ id: 'a' }))
  h.show.push(gift({ id: 'b', giftId: 8, uid: 'u9' }))
  h.show.clear()
  assert.equal(h.current, null)
  assert.deepEqual(h.consumed.flat().sort(), ['a', 'b'])
})
