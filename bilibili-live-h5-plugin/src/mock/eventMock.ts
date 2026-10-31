import type { EventHandler } from '../lib/eventChannel'
import type { DanmakuEvent, DanmakuIdentity, GiftEvent, PluginEvent } from '../lib/types'

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

const MOCK_IDENTITIES: Array<DanmakuIdentity | undefined> = [
  'admin',
  'guard',
  'member',
  'normal',
  undefined,
]
let mockSeq = 0

function makeDanmaku(): DanmakuEvent {
  const uname = pick(NAMES)
  const msg = pick(TEXTS)
  const identity = MOCK_IDENTITIES[mockSeq % MOCK_IDENTITIES.length]
  mockSeq += 1
  const ev: DanmakuEvent = {
    type: 'danmaku',
    id: uid(),
    uid: uid(),
    uname,
    msg,
    avatar: undefined,
    ts: Date.now(),
  }
  if (identity) ev.identity = identity
  if (msg.includes('高能')) ev.highlight = true
  return ev
}

/** Fixed sample lines for the settings preview. Does not open a socket. */
export function settingsPreviewSamples(): { danmaku: DanmakuEvent[]; gift: GiftEvent } {
  const ts = 1_700_000_000_000
  return {
    danmaku: [
      {
        type: 'danmaku',
        id: 'preview-highlight',
        uid: 'preview-u4',
        uname: '高亮示例',
        msg: '前方高能预警',
        ts,
      },
      {
        type: 'danmaku',
        id: 'preview-admin',
        uid: 'preview-u1',
        uname: '房管酱',
        msg: '房管巡查',
        ts,
        identity: 'admin',
      },
      {
        type: 'danmaku',
        id: 'preview-guard',
        uid: 'preview-u2',
        uname: '舰长酱',
        msg: '舰长报到',
        ts,
        identity: 'guard',
      },
      {
        type: 'danmaku',
        id: 'preview-member',
        uid: 'preview-u3',
        uname: '粉丝牌',
        msg: '粉丝团打卡',
        ts,
        identity: 'member',
      },
      {
        type: 'danmaku',
        id: 'preview-normal',
        uid: 'preview-u5',
        uname: '路过观众',
        msg: '这是一条普通弹幕',
        ts,
        identity: 'normal',
      },
      {
        type: 'danmaku',
        id: 'preview-block',
        uid: 'preview-u6',
        uname: '屏蔽示例',
        msg: '这是广告弹幕',
        ts,
      },
    ],
    gift: {
      type: 'gift',
      id: 'preview-gift',
      uid: 'preview-g1',
      uname: '礼物示例',
      giftId: 25,
      giftName: '小电视',
      num: 2,
      price: 1_245_000,
      ts,
    },
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
