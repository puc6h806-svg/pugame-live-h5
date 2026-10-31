/** Events pushed from this backend to H5 frontends over WebSocket JSON text frames. */

export type ErrorCode = 'UNAUTHORIZED' | 'ROOM_LIMIT' | 'MSG_TYPE' | 'INTERNAL';

export interface DanmakuEvent {
  type: 'danmaku';
  id: string;
  uid: string;
  uname: string;
  msg: string;
  avatar?: string;
  ts: number;
}

export interface GiftEvent {
  type: 'gift';
  id: string;
  uid: string;
  uname: string;
  giftId: number;
  giftName: string;
  num: number;
  /** Official integer: 1000 = 1 CNY = 10 batteries. Pass through data.price as-is. */
  price: number;
  ts: number;
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

export type ClientEvent = DanmakuEvent | GiftEvent | ConfigUpdatedEvent | ErrorEvent;
