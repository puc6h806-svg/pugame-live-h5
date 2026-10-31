import type { EventHandler } from '../lib/eventChannel'
import type { DanmakuEvent, GiftEvent, PluginEvent } from '../lib/types'

const NAMES = ['小明', '阿花', '直播粉A', '夜猫子', '舰长酱', '醒目仔', '路过的观众', '弹幕机器']
const TEXTS = [
  '哈哈哈好好笑',
  '主播加油！',
  '来了来了',
  '这个操作绝了',
  '礼物走一波',
  '关注了关注了',
  '666666',
  '请问几点开播？',
  '前方高能',
  '好听好听',
]

const GIFTS = [
  { giftName: '小电视', giftId: 25, price: 1245000 },
  { giftName: '小心心', giftId: 30607, price: 100 },
  { giftName: '辣条', giftId: 1, price: 100 },
  { giftName: 'B坷垃', giftId: 3, price: 9900 },
  { giftName: '嘉然的喵喵', giftId: 9, price: 5200 },
]

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function makeDanmaku(): DanmakuEvent {
  const uname = pick(NAMES)
  return {
    type: 'danmaku',
    id: uid(),
    uid: uid(),
    uname,
    msg: pick(TEXTS),
    avatar: undefined,
    ts: Date.now(),
  }
}

function makeGift(
  over: Partial<Pick<GiftEvent, 'uid' | 'uname' | 'giftId' | 'giftName' | 'num' | 'price'>> = {},
): GiftEvent {
  const g = pick(GIFTS)
  return {
    type: 'gift',
    id: uid(),
    uid: over.uid ?? uid(),
    uname: over.uname ?? pick(NAMES),
    giftId: over.giftId ?? g.giftId,
    giftName: over.giftName ?? g.giftName,
    num: over.num ?? (Math.random() > 0.7 ? Math.ceil(Math.random() * 10) : 1),
    price: over.price ?? g.price,
    ts: Date.now(),
  }
}

export interface MockHandle {
  stop: () => void
  triggerError: (code?: string) => void
  push: (ev: PluginEvent) => void
}

/** Runtime mock: danmaku every 1–2s, occasional gift (including short combos). */
export function startMockChannel(onEvent: EventHandler): MockHandle {
  const timers: number[] = []
  let stopped = false

  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      if (!stopped) fn()
    }, ms)
    timers.push(id)
  }

  const emitCombo = () => {
    const uname = pick(NAMES)
    const userId = uid()
    const g = pick(GIFTS)
    for (let i = 0; i < 3; i++) {
      later(i * 420, () => {
        onEvent(
          makeGift({
            uid: userId,
            uname,
            giftId: g.giftId,
            giftName: g.giftName,
            num: 1,
            price: g.price,
          }),
        )
      })
    }
  }

  const emitPair = () => {
    const first = GIFTS[0]!
    const second = GIFTS[3]!
    later(0, () => {
      onEvent(makeGift({ giftId: first.giftId, giftName: first.giftName, price: first.price, num: 1 }))
    })
    later(80, () => {
      onEvent(makeGift({ giftId: second.giftId, giftName: second.giftName, price: second.price, num: 1 }))
    })
  }

  const scheduleDanmaku = () => {
    if (stopped) return
    const delay = 1000 + Math.random() * 1000
    const id = window.setTimeout(() => {
      onEvent(makeDanmaku())
      if (Math.random() < 0.22) {
        const roll = Math.random()
        if (roll < 0.55) emitCombo()
        else if (roll < 0.8) emitPair()
        else later(0, () => onEvent(makeGift()))
      }
      scheduleDanmaku()
    }, delay)
    timers.push(id)
  }

  later(180, () => onEvent(makeDanmaku()))
  later(520, () => onEvent(makeDanmaku()))
  later(700, () => emitCombo())
  scheduleDanmaku()

  return {
    stop() {
      stopped = true
      timers.forEach((t) => clearTimeout(t))
    },
    triggerError(code = 'UNKNOWN') {
      onEvent({ type: 'error', code })
    },
    push(ev) {
      onEvent(ev)
    },
  }
}
