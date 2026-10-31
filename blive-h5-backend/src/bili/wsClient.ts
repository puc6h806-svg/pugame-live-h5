import WebSocket from 'ws';
import {
  decodePackets,
  encodeAuth,
  encodeHeartbeat,
  OP_AUTH_REPLY,
  OP_HEARTBEAT_REPLY,
  OP_SEND_SMS_REPLY,
  parseBodyJson,
} from './wsProto';
import { normalizeCmd } from './events';
import type { DanmakuEvent, GiftEvent } from '../types/events';
import { appHeartbeat } from './client';

/** Both WS OP heartbeat and HTTP /v2/app/heartbeat use 20s (official body text). */
const WS_HEARTBEAT_MS = 20_000;
const HTTP_HEARTBEAT_MS = 20_000;

export type UpstreamEventHandler = (event: DanmakuEvent | GiftEvent) => void;
export type UpstreamErrorHandler = (err: Error) => void;
export type UpstreamCloseHandler = (reason: string) => void;

export interface UpstreamConnectOpts {
  wssLinks: string[];
  authBody: string;
  gameId: string;
  onEvent: UpstreamEventHandler;
  onError?: UpstreamErrorHandler;
  onClose?: UpstreamCloseHandler;
  /** Log unknown / unsubscribed cmds (MSG_TYPE style). */
  onMsgType?: (cmd: string) => void;
}

/**
 * One upstream long-conn to Bilibili open platform for a room.
 * Dual heartbeat: WS OP_HEARTBEAT every 20s + HTTP /v2/app/heartbeat every 20s.
 */
export class BiliWsClient {
  private ws: WebSocket | null = null;
  private linkIndex = 0;
  private wsHbTimer: ReturnType<typeof setInterval> | null = null;
  private httpHbTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private readonly opts: UpstreamConnectOpts;

  constructor(opts: UpstreamConnectOpts) {
    this.opts = opts;
  }

  start(): void {
    this.closed = false;
    this.connectCurrent();
  }

  stop(): void {
    this.closed = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  private clearTimers(): void {
    if (this.wsHbTimer) {
      clearInterval(this.wsHbTimer);
      this.wsHbTimer = null;
    }
    if (this.httpHbTimer) {
      clearInterval(this.httpHbTimer);
      this.httpHbTimer = null;
    }
  }

  private connectCurrent(): void {
    const links = this.opts.wssLinks;
    if (!links.length) {
      this.opts.onError?.(new Error('No wss_link provided'));
      return;
    }
    if (this.linkIndex >= links.length) {
      this.opts.onClose?.('all wss nodes failed');
      return;
    }

    const url = links[this.linkIndex];
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      if (this.closed) return;
      ws.send(encodeAuth(this.opts.authBody));
      this.startHeartbeats();
    });

    ws.on('message', (data: WebSocket.RawData) => {
      if (this.closed) return;
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      this.handleRaw(buf);
    });

    ws.on('error', (err) => {
      this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    });

    ws.on('close', () => {
      this.clearTimers();
      if (this.closed) {
        this.opts.onClose?.('stopped');
        return;
      }
      // Fail over to next cluster node
      this.linkIndex += 1;
      if (this.linkIndex < links.length) {
        this.connectCurrent();
      } else {
        this.opts.onClose?.('connection closed');
      }
    });
  }

  private startHeartbeats(): void {
    this.clearTimers();
    this.wsHbTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(encodeHeartbeat());
      }
    }, WS_HEARTBEAT_MS);

    // Fire HTTP heartbeat soon, then every 20s
    const beat = () => {
      void appHeartbeat(this.opts.gameId).catch((err: unknown) => {
        this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
      });
    };
    beat();
    this.httpHbTimer = setInterval(beat, HTTP_HEARTBEAT_MS);
  }

  private handleRaw(buf: Buffer): void {
    const packets = decodePackets(buf);
    for (const pkt of packets) {
      if (pkt.operation === OP_AUTH_REPLY || pkt.operation === OP_HEARTBEAT_REPLY) {
        continue;
      }
      if (pkt.operation !== OP_SEND_SMS_REPLY) {
        continue;
      }
      const json = parseBodyJson(pkt.body);
      if (json == null) continue;
      const result = normalizeCmd(json);
      if (result.kind === 'event') {
        this.opts.onEvent(result.event);
      } else if (result.kind === 'unknown_type' && result.cmd) {
        this.opts.onMsgType?.(result.cmd);
      }
      // skip: ignore quietly
    }
  }
}
