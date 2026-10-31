import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, type WebSocket } from 'ws';
import { loadEnv } from './utils/env';
import { createApiRouter } from './gateway/routes';
import { roomHub } from './gateway/roomHub';
import { verifySessionToken } from './session/token';
import type { ErrorCode } from './types/events';

function pushError(ws: WebSocket, code: ErrorCode, message?: string): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type: 'error', code, message }));
  }
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
    try {
      const host = req.headers.host ?? 'localhost';
      const url = new URL(req.url ?? '/ws', `http://${host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        pushError(ws, 'UNAUTHORIZED', 'token query param required');
        ws.close();
        return;
      }

      let payload;
      try {
        payload = verifySessionToken(token);
      } catch {
        pushError(ws, 'UNAUTHORIZED', 'invalid or expired token');
        ws.close();
        return;
      }

      const ok = roomHub.attachFrontend(ws, payload.roomId, payload.appId);
      if (!ok) {
        // ROOM_LIMIT or missing session already pushed
        ws.close();
      }
    } catch (err) {
      pushError(ws, 'INTERNAL', err instanceof Error ? err.message : 'ws error');
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
