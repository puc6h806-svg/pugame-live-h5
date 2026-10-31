import type WebSocket from 'ws';
import { BiliWsClient } from '../bili/wsClient';
import { appEnd, appStart, mapBiliCode, BiliApiError, type StartData } from '../bili/client';
import { configStore } from '../config/store';
import { loadEnv } from '../utils/env';
import type { ClientEvent, DanmakuEvent, GiftEvent, ErrorCode, PlugEnv } from '../types/events';
import { ERROR_TEXT, UPSTREAM_CLOSED_MESSAGE } from '../types/events';
import type { RoomConfig, RoomConfigPartial } from '../types/config';
import { applyDanmakuPolicy } from './danmakuPolicy';
import { GiftComboBuffer, ingestGift } from './giftCombo';
import { applyNoticeHook } from './noticeHook';

/** Max frontend WS connections per room on this service. */
export const MAX_FRONTEND_PER_ROOM = 5;

interface FrontendClient {
  ws: WebSocket;
  roomId: number;
  appId: string;
  plugEnv: PlugEnv;
}

interface RoomSession {
  roomId: number;
  appId: string;
  gameId: string;
  /** Kept server-side only — never sent to frontend. */
  authBody: string;
  wssLinks: string[];
  anchor: { uname: string; uFace?: string; roomId: number };
  upstream: BiliWsClient | null;
  frontends: Set<FrontendClient>;
  ending: boolean;
  upstreamFailed: boolean;
  combo: GiftComboBuffer;
}

function sendJson(ws: WebSocket, event: ClientEvent): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

export function errorEvent(code: ErrorCode, message?: string): ClientEvent {
  return { type: 'error', code, message: message ?? ERROR_TEXT[code] };
}

/**
 * Connection governance:
 * - One upstream Bili WS per room (client mode); many frontends multiplex.
 * - Frontend count ≤ MAX_FRONTEND_PER_ROOM; excess → ROOM_LIMIT.
 * - Call /v2/app/end when last frontend leaves, upstream dies, or process exits.
 */
export class RoomHub {
  private readonly rooms = new Map<string, RoomSession>();
  /** In-flight app/end so a replacement start waits until the previous game_id is closed. */
  private readonly tearingDown = new Map<string, Promise<void>>();

  private key(roomId: number, appId: string): string {
    return `${roomId}:${appId}`;
  }

  getFrontendCount(roomId: number, appId: string): number {
    return this.rooms.get(this.key(roomId, appId))?.frontends.size ?? 0;
  }

  getSession(roomId: number, appId: string): RoomSession | undefined {
    return this.rooms.get(this.key(roomId, appId));
  }

  /**
   * Exchange identity code for a room session (server-side start).
   * Reuses the existing upstream when the same game_id is already running.
   */
  async startWithCode(code: string): Promise<{
    roomId: number;
    gameId: string;
    appId: string;
    anchor: { uname: string; uFace?: string; roomId: number };
  }> {
    const env = loadEnv();
    const appId = env.biliAppId;

    let data: StartData;
    try {
      data = await appStart(code);
    } catch (err) {
      if (err instanceof BiliApiError) {
        const mapped = mapBiliCode(err.code);
        const e = new Error(err.message) as Error & { code: ErrorCode; biliCode: number };
        e.code = mapped;
        e.biliCode = err.code;
        throw e;
      }
      throw err;
    }

    const roomId = data.anchor_info.room_id;
    const gameId = data.game_info.game_id;
    const k = this.key(roomId, appId);

    const existing = this.rooms.get(k);
    if (existing && !existing.ending && existing.gameId === gameId) {
      existing.anchor = {
        uname: data.anchor_info.uname,
        uFace: data.anchor_info.uface || undefined,
        roomId,
      };
      this.ensureUpstream(existing);
      return {
        roomId,
        gameId,
        appId,
        anchor: existing.anchor,
      };
    }

    if (existing) {
      await this.teardownRoom(k, 'replaced');
    }

    const session = this.createSession(data, appId, new Set());
    this.rooms.set(k, session);
    this.ensureUpstream(session);

    return {
      roomId,
      gameId,
      appId,
      anchor: session.anchor,
    };
  }

  private createSession(data: StartData, appId: string, frontends: Set<FrontendClient>): RoomSession {
    const roomId = data.anchor_info.room_id;
    const session: RoomSession = {
      roomId,
      appId,
      gameId: data.game_info.game_id,
      authBody: data.websocket_info.auth_body,
      wssLinks: [...(data.websocket_info.wss_link ?? [])],
      anchor: {
        uname: data.anchor_info.uname,
        uFace: data.anchor_info.uface || undefined,
        roomId,
      },
      upstream: null,
      frontends,
      ending: false,
      upstreamFailed: false,
      combo: undefined as unknown as GiftComboBuffer,
    };
    session.combo = new GiftComboBuffer((ev) => this.broadcast(session, ev));
    return session;
  }

  private ensureUpstream(session: RoomSession): void {
    if (session.upstream || session.ending) return;
    const upstream = new BiliWsClient({
      wssLinks: session.wssLinks,
      authBody: session.authBody,
      gameId: session.gameId,
      onEvent: (ev) => this.broadcastFiltered(session, ev),
      onError: (err) => {
        // Log only. Do not forward raw upstream text (may include link details).
        console.warn(`[room ${session.roomId}] upstream error:`, err.message.slice(0, 200));
      },
      onMsgType: (cmd) => {
        console.warn(`[room ${session.roomId}] unhandled cmd: ${cmd}`);
      },
      onSkippedCmd: (cmd) => {
        const notice = configStore.get(session.roomId, session.appId).notice;
        const hook = applyNoticeHook(cmd, notice);
        // Placeholder only. Unopened cmds never become MSG_TYPE.
        if (hook.action === 'reserved' && hook.event) {
          this.broadcast(session, hook.event);
        }
      },
      onClose: (reason) => {
        session.upstream = null;
        if (reason === 'stopped' || session.ending) return;
        this.failUpstream(session);
      },
    });
    session.upstream = upstream;
    upstream.start();
  }

  /** Upstream socket ended after wss failover. Tell clients, then app/end. */
  private failUpstream(session: RoomSession): void {
    if (session.ending || session.upstreamFailed) return;
    session.upstreamFailed = true;
    session.combo.flushAll();
    this.broadcast(session, errorEvent('INTERNAL', UPSTREAM_CLOSED_MESSAGE));
    void this.teardownRoom(this.key(session.roomId, session.appId), 'upstream closed');
  }

  private broadcastFiltered(session: RoomSession, ev: DanmakuEvent | GiftEvent): void {
    const cfg = configStore.get(session.roomId, session.appId);
    if (ev.type === 'danmaku') {
      const out = applyDanmakuPolicy(ev, cfg.danmaku);
      if (!out) return;
      this.broadcast(session, out);
      return;
    }
    ingestGift(session.combo, session.roomId, ev, cfg.gift);
  }

  private broadcast(session: RoomSession, event: ClientEvent): void {
    for (const client of session.frontends) {
      sendJson(client.ws, event);
    }
  }

  /** Push config_updated to all frontends in the room. */
  pushConfigUpdated(roomId: number, appId: string, config: RoomConfig): void {
    const session = this.rooms.get(this.key(roomId, appId));
    if (!session) return;
    this.broadcast(session, { type: 'config_updated', config });
  }

  /** Apply a partial config and notify frontends. comboWindowMs=0 flushes the buffer. */
  updateConfig(roomId: number, appId: string, partial: RoomConfigPartial): RoomConfig {
    const prev = configStore.get(roomId, appId);
    const config = configStore.put(roomId, appId, partial);
    this.pushConfigUpdated(roomId, appId, config);
    if (prev.gift.comboWindowMs > 0 && config.gift.comboWindowMs <= 0) {
      this.rooms.get(this.key(roomId, appId))?.combo.flushAll();
    }
    return config;
  }

  private sendHello(ws: WebSocket, session: RoomSession, plugEnv: PlugEnv): void {
    const config = configStore.get(session.roomId, session.appId);
    sendJson(ws, { type: 'hello', roomId: session.roomId, plugEnv, config });
    sendJson(ws, { type: 'config_updated', config });
  }

  /**
   * Attach a frontend WS. Returns false + sends ROOM_LIMIT / UNAUTHORIZED if rejected.
   * On success pushes hello (includes config) and config_updated for older clients.
   */
  attachFrontend(ws: WebSocket, roomId: number, appId: string, plugEnv: PlugEnv = 0): boolean {
    const session = this.rooms.get(this.key(roomId, appId));
    if (!session || session.ending) {
      sendJson(ws, errorEvent('UNAUTHORIZED'));
      return false;
    }
    if (session.frontends.size >= MAX_FRONTEND_PER_ROOM) {
      sendJson(ws, errorEvent('ROOM_LIMIT'));
      return false;
    }

    const client: FrontendClient = { ws, roomId, appId, plugEnv };
    session.frontends.add(client);
    this.ensureUpstream(session);
    this.sendHello(ws, session, plugEnv);

    ws.on('close', () => {
      session.frontends.delete(client);
      void this.maybeEndWhenEmpty(session);
    });

    return true;
  }

  /** Same-room auth frame may update plugEnv and re-send hello. */
  setPlugEnv(ws: WebSocket, roomId: number, appId: string, plugEnv: PlugEnv): void {
    const session = this.rooms.get(this.key(roomId, appId));
    if (!session || session.ending) return;
    for (const client of session.frontends) {
      if (client.ws !== ws) continue;
      client.plugEnv = plugEnv;
      this.sendHello(ws, session, plugEnv);
      return;
    }
  }

  private async maybeEndWhenEmpty(session: RoomSession): Promise<void> {
    if (session.frontends.size > 0 || session.ending) return;
    await this.teardownRoom(this.key(session.roomId, session.appId), 'no subscribers');
  }

  async endSession(roomId: number, appId: string): Promise<void> {
    await this.teardownRoom(this.key(roomId, appId), 'session end');
  }

  private teardownRoom(k: string, reason: string): Promise<void> {
    const pending = this.tearingDown.get(k);
    const session = this.rooms.get(k);
    if (!session) return pending ?? Promise.resolve();
    if (session.ending) return pending ?? Promise.resolve();

    session.ending = true;
    const job = this.finishTeardown(session, k, reason).finally(() => {
      if (this.tearingDown.get(k) === job) this.tearingDown.delete(k);
    });
    this.tearingDown.set(k, job);
    return job;
  }

  private async finishTeardown(session: RoomSession, k: string, reason: string): Promise<void> {
    try {
      session.combo.flushAll();
      session.combo.dispose();

      session.upstream?.stop();
      session.upstream = null;

      for (const client of [...session.frontends]) {
        try {
          client.ws.close();
        } catch {
          /* ignore */
        }
      }
      session.frontends.clear();

      // end 必达 — awaited so a replacement start cannot race a late app/end
      try {
        await appEnd(session.gameId);
      } catch (err) {
        console.warn(
          `[room ${session.roomId}] app/end failed (${reason}):`,
          err instanceof Error ? err.message : err,
        );
      }
    } finally {
      if (this.rooms.get(k) === session) {
        this.rooms.delete(k);
      }
    }
  }

  /** Process exit / signal: end all rooms. */
  async shutdownAll(): Promise<void> {
    const keys = [...this.rooms.keys()];
    await Promise.all(keys.map((k) => this.teardownRoom(k, 'process shutdown')));
  }
}

export const roomHub = new RoomHub();
