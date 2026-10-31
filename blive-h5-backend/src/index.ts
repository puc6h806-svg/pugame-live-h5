import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { loadEnv } from './utils/env';
import { createApiRouter } from './gateway/routes';
import { roomHub } from './gateway/roomHub';
import { parseInbound, parsePlugEnv } from './gateway/inbound';
import { verifySessionToken } from './session/token';
import type { ErrorCode, PlugEnv } from './types/events';
import { ERROR_TEXT } from './types/events';

const AUTH_WAIT_MS = 5_000;

function pushError(ws: WebSocket, code: ErrorCode, message?: string): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'error', code, message: message ?? ERROR_TEXT[code] }));
  }
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

async function main(): Promise<void> {
  const env = loadEnv();

  const app = express();
  app.use(
    cors({
      origin: env.allowedOrigins.length ? env.allowedOrigins : true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    let attached: { roomId: number; appId: string } | null = null;
    let plugEnv: PlugEnv = 0;
    let authTimer: ReturnType<typeof setTimeout> | null = null;

    const clearAuthTimer = () => {
      if (!authTimer) return;
      clearTimeout(authTimer);
      authTimer = null;
    };

    const attachWithToken = (token: string, envPlug: PlugEnv | undefined): void => {
      let payload;
      try {
        payload = verifySessionToken(token);
      } catch (err) {
        console.warn('[ws] auth failed:', err instanceof Error ? err.message : err);
        pushError(ws, 'UNAUTHORIZED');
        if (!attached) ws.close();
        return;
      }

      if (envPlug === 0 || envPlug === 1) plugEnv = envPlug;

      if (attached) {
        if (attached.roomId !== payload.roomId || attached.appId !== payload.appId) {
          pushError(ws, 'UNAUTHORIZED');
          return;
        }
        roomHub.setPlugEnv(ws, payload.roomId, payload.appId, plugEnv);
        return;
      }

      const ok = roomHub.attachFrontend(ws, payload.roomId, payload.appId, plugEnv);
      if (!ok) {
        ws.close();
        return;
      }
      attached = { roomId: payload.roomId, appId: payload.appId };
      clearAuthTimer();
    };

    ws.on('message', (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(rawToString(data));
      } catch {
        return;
      }
      const msg = parseInbound(raw);
      if (msg.type === 'auth') {
        attachWithToken(msg.token, msg.plugEnv);
        return;
      }
      if (msg.type === 'config.set') {
        if (!attached) {
          pushError(ws, 'UNAUTHORIZED');
          return;
        }
        roomHub.updateConfig(attached.roomId, attached.appId, msg.patch);
        return;
      }
      if (msg.type === 'invalid') {
        pushError(ws, msg.code, msg.code === 'INTERNAL' ? '配置无效' : undefined);
      }
    });

    ws.on('close', () => clearAuthTimer());

    try {
      const host = req.headers.host ?? 'localhost';
      const url = new URL(req.url ?? '/ws', `http://${host}`);
      const token = url.searchParams.get('token');
      const fromQuery = parsePlugEnv(url.searchParams.get('plugEnv') ?? url.searchParams.get('plug_env'));
      if (fromQuery !== undefined) plugEnv = fromQuery;

      if (token) {
        attachWithToken(token, plugEnv);
        return;
      }

      authTimer = setTimeout(() => {
        if (!attached && ws.readyState === ws.OPEN) {
          pushError(ws, 'UNAUTHORIZED');
          ws.close();
        }
      }, AUTH_WAIT_MS);
    } catch (err) {
      console.warn('[ws] connection error:', err instanceof Error ? err.message : err);
      pushError(ws, 'INTERNAL');
      ws.close();
    }
  });

  // end 必达 on process signals
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal}: ending all room sessions…`);
    try {
      await roomHub.shutdownAll();
    } finally {
      wss.close();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10_000).unref();
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('beforeExit', () => {
    void roomHub.shutdownAll();
  });

  server.listen(env.port, () => {
    console.log(`blive-h5-backend listening on :${env.port}`);
    console.log(`  POST /api/session/start  POST /api/session/end`);
    console.log(`  GET/PUT /api/config  WS /ws?token=…`);
  });
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
