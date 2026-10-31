/**
 * One fullscreen gift slot.
 * Same uid + giftId merges into the visible card, or into a queued card
 * whose last hit is still inside the combo window.
 * The next card waits until this one is released and at least GIFT_QUEUE_GAP_MS
 * has passed since it was torn down. The slot unmounts when duration elapses;
 * a combo refreshes that timer from the latest hit.
 * Heartbeat is unrelated and stays on the backend.
 */

export const GIFT_QUEUE_GAP_MS = 300
export const GIFT_COMBO_WINDOW_MS = 2000
const MIN_DURATION_MS = 800
const DEFAULT_DURATION_MS = 3000

export interface GiftTick {
  id: string
  uid: string
  giftId: number
  num: number
}

export interface GiftCard<T extends GiftTick> {
  key: string
  gift: T
  ids: string[]
  hits: number
  bump: number
}

interface Queued<T extends GiftTick> {
  gift: T
  ids: string[]
  hits: number
  lastTs: number
}

export interface GiftShowHooks<T extends GiftTick> {
  now: () => number
  durationMs: () => number
  /** Schedule `fn` after `ms`. Return a cancel function. */
  later: (ms: number, fn: () => void) => () => void
  onShow: (card: GiftCard<T> | null) => void
  onConsumed: (ids: string[]) => void
}

export interface GiftShow<T extends GiftTick> {
  push: (gift: T) => void
  /** Call when the leave transition finishes and the slot is visually free. */
  release: () => void
  clear: () => void
}

function comboKey(gift: GiftTick): string {
  return `${gift.uid}:${gift.giftId}`
}

function normalizeNum(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.floor(n)
}

function displayMs(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DURATION_MS
  return Math.max(MIN_DURATION_MS, raw)
}

export function createGiftShow<T extends GiftTick>(hooks: GiftShowHooks<T>): GiftShow<T> {
  let active: GiftCard<T> | null = null
  let holding = false
  let lastEndedAt = 0
  const pending: Queued<T>[] = []
  const seen = new Set<string>()
  let cancelDuration: (() => void) | null = null
  let cancelGap: (() => void) | null = null

  function publish(card: GiftCard<T> | null) {
    hooks.onShow(card)
  }

  function arm() {
    cancelDuration?.()
    cancelDuration = hooks.later(displayMs(hooks.durationMs()), () => {
      cancelDuration = null
      endActive()
    })
  }

  function endActive() {
    if (!active) return
    const ids = active.ids.slice()
    active = null
    lastEndedAt = hooks.now()
    publish(null)
    if (ids.length) hooks.onConsumed(ids)
  }

  function showNext(next: Queued<T>) {
    holding = true
    active = {
      key: next.ids[0] ?? next.gift.id,
      gift: { ...next.gift },
      ids: next.ids.slice(),
      hits: next.hits,
      bump: next.hits,
    }
    publish(active)
    arm()
  }

  function pump() {
    if (holding || active) return
    if (cancelGap) return
    if (!pending.length) return
    const elapsed = lastEndedAt === 0 ? GIFT_QUEUE_GAP_MS : hooks.now() - lastEndedAt
    const wait = Math.max(0, GIFT_QUEUE_GAP_MS - elapsed)
    if (wait > 0) {
      cancelGap = hooks.later(wait, () => {
        cancelGap = null
        pump()
      })
      return
    }
    const next = pending.shift()
    if (!next) return
    showNext(next)
  }

  function mergeQueued(gift: T, count: number, now: number): boolean {
    const key = comboKey(gift)
    for (let i = pending.length - 1; i >= 0; i--) {
      const item = pending[i]
      if (!item) continue
      if (comboKey(item.gift) !== key) continue
      if (now - item.lastTs > GIFT_COMBO_WINDOW_MS) continue
      item.gift = {
        ...item.gift,
        ...gift,
        num: item.gift.num + count,
        id: item.gift.id,
      }
      item.ids.push(gift.id)
      item.hits += 1
      item.lastTs = now
      return true
    }
    return false
  }

  return {
    push(gift) {
      if (!gift.id || seen.has(gift.id)) return
      seen.add(gift.id)
      const now = hooks.now()
      const count = normalizeNum(gift.num)
      const stamped = { ...gift, num: count }

      if (active && comboKey(active.gift) === comboKey(stamped)) {
        active = {
          ...active,
          gift: {
            ...active.gift,
            ...stamped,
            num: active.gift.num + count,
            id: active.gift.id,
          },
          ids: active.ids.concat(gift.id),
          hits: active.hits + 1,
          bump: active.bump + 1,
        }
        publish(active)
        arm()
        return
      }

      if (mergeQueued(stamped, count, now)) return

      pending.push({
        gift: stamped,
        ids: [gift.id],
        hits: 1,
        lastTs: now,
      })
      pump()
    },
    release() {
      if (!holding || active) return
      holding = false
      pump()
    },
    clear() {
      cancelDuration?.()
      cancelDuration = null
      cancelGap?.()
      cancelGap = null
      const ids = [...(active?.ids ?? []), ...pending.flatMap((item) => item.ids)]
      active = null
      pending.length = 0
      holding = false
      publish(null)
      if (ids.length) hooks.onConsumed(ids)
    },
  }
}
