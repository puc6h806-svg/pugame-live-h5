/** Events pushed from this backend to H5 frontends over WebSocket JSON text frames. */

export type ErrorCode = 'UNAUTHORIZED' | 'ROOM_LIMIT' | 'MSG_TYPE' | 'INTERNAL';

/** Canonical short Chinese copy. Frontends may map the code; message is the same text. */
export const ERROR_TEXT: Record<ErrorCode, string> = {
  UNAUTHORIZED: '未授权或验签失败',
  ROOM_LIMIT: '连接数已满或房间不可用',
  MSG_TYPE: '消息类型未开通',
  INTERNAL: '服务异常请稍后重试',
};

/** Upstream long-conn ended (all wss nodes failed or the socket closed). Still code INTERNAL. */
export const UPSTREAM_CLOSED_MESSAGE = '上游连接已结束';

export type PlugEnv = 0 | 1;

export interface DanmakuEvent {
  type: 'danmaku';
  id: string;
  uid: string;
  uname: string;
  /**
   * Barrage text. Kept for clients already reading `msg`.
   * `text` is the same string (new contract).
   */
  msg: string;
  text: string;
  avatar?: string;
  ts: number;
  /** True when msg/text hits danmaku.highlightKeywords. Omitted otherwise. */
  highlight?: boolean;
  /** Reserved. Not populated in this slice. */
  identity?: string;
}

export interface GiftEvent {
  type: 'gift';
  id: string;
  uid: string;
  uname: string;
  giftId: number;
  giftName: string;
  /** Count after combo merge (or the single gift's num when merge is off). */
  num: number;
  /** Official integer: 1000 = 1 CNY = 10 batteries. Unit price, not num * price. */
  price: number;
  ts: number;
  /**
   * Present only when 2+ upstream gifts were merged in the combo window.
   * Value equals the merged `num`.
   */
  combo?: number;
}

export interface HelloEvent {
  type: 'hello';
  roomId: number;
  plugEnv: PlugEnv;
  config: import('./config').RoomConfig;
}

export interface ConfigUpdatedEvent {
  type: 'config_updated';
  config: import('./config').RoomConfig;
}

export interface ErrorEvent {
  type: 'error';
  code: ErrorCode;
  message?: string;
}

export type ClientEvent = HelloEvent | DanmakuEvent | GiftEvent | ConfigUpdatedEvent | ErrorEvent;
