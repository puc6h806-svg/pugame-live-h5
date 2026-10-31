import type WebSocket from 'ws';
import { BiliWsClient } from '../bili/wsClient';
import { appEnd, appStart, mapBiliCode, BiliApiError, type StartData } from '../bili/client';
import { configStore } from '../config/store';
import { loadEnv } from '../utils/env';
import type { ClientEvent, DanmakuEvent, GiftEvent, ErrorCode } from '../types/events';
import type { RoomConfig } from '../types/config';

/** Max frontend WS connections per room on this service. */
export const MAX_FRONTEND_PER_ROOM = 5;

interface FrontendClient {
  ws: WebSocket;
  roomId: number;
  appId: string;
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
}

function sendJson(ws: WebSocket, event: ClientEvent): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function errorEvent(code: ErrorCode, message?: string): ClientEvent {
  return { type: 'error', code, message };
}

/**
 * Connection governance:
 * - One upstream Bili WS per room (client mode); many frontends multiplex.
 * - Frontend count ≤ MAX_FRONTEND_PER_ROOM; excess → ROOM_LIMIT.
 * - Call /v2/app/end when last frontend leaves or process exits.
 */
export class RoomHub {
  private readonly rooms = new Map<string, RoomSession>();

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
   * Reuses existing upstream if same room already running.
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

    // If already have a live session for this room, end previous game_id first
    const existing = this.rooms.get(k);
    if (existing && existing.gameId !== gameId) {
      await this.teardownRoom(k, 'replaced');
    }

    const session: RoomSession = {
      roomId,
      appId,
      gameId,
      authBody: data.websocket_info.auth_body,
      wssLinks: [...(data.websocket_info.wss_link ?? [])],
      anchor: {
        uname: data.anchor_info.uname,
        uFace: data.anchor_info.uface || undefined,
        roomId,
      },
      upstream: null,
      frontends: existing?.frontends ?? new Set(),
      ending: false,
    };

    this.rooms.set(k, session);
    this.ensureUpstream(session);

    return {
      roomId,
      gameId,
      appId,
      anchor: session.anchor,
    };
  }

  private ensureUpstream(session: RoomSession): void {
    if (session.upstream) return;
    const upstream = new BiliWsClient({
      wssLinks: session.wssLinks,
      authBody: session.authBody,
      gameId: session.gameId,
      onEvent: (ev) => this.broadcastFiltered(session, ev),
      onError: (err) => {
        // Don't leak secrets; only generic message to frontends
        this.broadcast(session, errorEvent('INTERNAL', err.message.slice(0, 200)));
      },
      onMsgType: (cmd) => {
        // Unsubscribed / unexpected cmd — log only; optional MSG_TYPE to clients
        console.warn(`[room ${session.roomId}] unhandled cmd: ${cmd}`);
      },
      onClose: () => {
        session.upstream = null;
      },
    });
    session.upstream = upstream;
    upstream.start();
  }

  private broadcastFiltered(session: RoomSession, ev: DanmakuEvent | GiftEvent): void {
    const cfg = configStore.get(session.roomId, session.appId);
    if (ev.type === 'danmaku') {
      if (!cfg.danmaku.enabled) return;
      const out: DanmakuEvent = { ...ev };
      if (!cfg.danmaku.showAvatar) delete out.avatar;
      this.broadcast(session, out);
      return;
    }
    if (ev.type === 'gift') {
      if (!cfg.gift.enabled) return;
      // MVP: integer compare minPrice vs official price
      if (ev.price < cfg.gift.minPrice) return;
      this.broadcast(session, ev);
    }
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

  /**
   * Attach a frontend WS. Returns false + sends ROOM_LIMIT if over cap.
   */
  attachFrontend(ws: WebSocket, roomId: number, appId: string): boolean {
    const session = this.rooms.get(this.key(roomId, appId));
    if (!session) {
      sendJson(ws, errorEvent('UNAUTHORIZED', 'No active room session; call /api/session/start first'));
      return false;
    }
    if (session.frontends.size >= MAX_FRONTEND_PER_ROOM) {
      sendJson(ws, errorEvent('ROOM_LIMIT', `Max ${MAX_FRONTEND_PER_ROOM} frontend connections per room`));
      return false;
    }

    const client: FrontendClient = { ws, roomId, appId };
    session.frontends.add(client);
    this.ensureUpstream(session);

    // Send current config on connect
    const config = configStore.get(roomId, appId);
    sendJson(ws, { type: 'config_updated', config });

    ws.on('close', () => {
      session.frontends.delete(client);
      void this.maybeEndWhenEmpty(session);
    });

    return true;
  }

  private async maybeEndWhenEmpty(session: RoomSession): Promise<void> {
    if (session.frontends.size > 0) return;
    await this.teardownRoom(this.key(session.roomId, session.appId), 'no subscribers');
  }

  async endSession(roomId: number, appId: string): Promise<void> {
    await this.teardownRoom(this.key(roomId, appId), 'session end');
  }

  private async teardownRoom(k: string, reason: string): Promise<void> {
    const session = this.rooms.get(k);
    if (!session || session.ending) return;
    session.ending = true;

    try {
      session.upstream?.stop();
      session.upstream = null;

      // Close remaining frontends
      for (const client of [...session.frontends]) {
        try {
          client.ws.close();
        } catch {
          /* ignore */
        }
      }
      session.frontends.clear();

      // end 必达
      try {
        await appEnd(session.gameId);
      } catch (err) {
        console.warn(`[room ${session.roomId}] app/end failed (${reason}):`, err instanceof Error ? err.message : err);
      }
    } finally {
      this.rooms.delete(k);
    }
  }

  /** Process exit / signal: end all rooms. */
  async shutdownAll(): Promise<void> {
    const keys = [...this.rooms.keys()];
    await Promise.all(keys.map((k) => this.teardownRoom(k, 'process shutdown')));
  }
}

export const roomHub = new RoomHub();
