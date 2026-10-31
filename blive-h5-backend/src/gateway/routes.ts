import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { roomHub } from './roomHub';
import { issueSessionToken, verifySessionToken } from '../session/token';
import { configStore } from '../config/store';
import { roomConfigPatchSchema, toRoomConfigPartial } from '../config/schema';
import { loadEnv } from '../utils/env';
import type { ErrorCode } from '../types/events';
import { ERROR_TEXT } from '../types/events';

function sendError(res: Response, status: number, code: ErrorCode, message?: string): void {
  res.status(status).json({ type: 'error', code, message: message ?? ERROR_TEXT[code] });
}

function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

export function createApiRouter(): Router {
  const router = Router();

  /** POST /api/session/start { code } — identity code exchange (server-only secrets). */
  router.post('/session/start', async (req: Request, res: Response) => {
    const schema = z.object({ code: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'UNAUTHORIZED');
      return;
    }

    try {
      const started = await roomHub.startWithCode(parsed.data.code);
      const { token, expiresIn } = issueSessionToken({
        roomId: started.roomId,
        gameId: started.gameId,
        appId: started.appId,
        uname: started.anchor.uname,
        uFace: started.anchor.uFace,
      });

      // Never expose access secret, auth_body, or full wss details
      res.json({
        token,
        roomId: started.roomId,
        anchor: {
          uname: started.anchor.uname,
          uFace: started.anchor.uFace,
          roomId: started.anchor.roomId,
        },
        expiresIn,
      });
    } catch (err) {
      const e = err as Error & { code?: ErrorCode };
      const code: ErrorCode = e.code ?? 'INTERNAL';
      console.warn('[session/start]', code, e.message);
      const status = code === 'UNAUTHORIZED' ? 401 : code === 'ROOM_LIMIT' ? 429 : 500;
      sendError(res, status, code);
    }
  });

  /** POST /api/session/end — Bearer token; end + close upstream WS. */
  router.post('/session/end', async (req: Request, res: Response) => {
    const token = bearerToken(req);
    if (!token) {
      sendError(res, 401, 'UNAUTHORIZED');
      return;
    }
    try {
      const payload = verifySessionToken(token);
      await roomHub.endSession(payload.roomId, payload.appId);
      res.json({ ok: true });
    } catch (err) {
      console.warn('[session/end]', err instanceof Error ? err.message : err);
      sendError(res, 401, 'UNAUTHORIZED');
    }
  });

  /** GET /api/config?roomId=&appId= */
  router.get('/config', (req: Request, res: Response) => {
    const roomId = String(req.query.roomId ?? '');
    const appId = String(req.query.appId ?? loadEnv().biliAppId);
    if (!roomId) {
      sendError(res, 400, 'INTERNAL', '配置无效');
      return;
    }
    const config = configStore.get(roomId, appId);
    res.json({ roomId: Number(roomId) || roomId, appId, config });
  });

  /** PUT /api/config body { roomId, appId?, danmaku?, gift?, layout?, notice? } */
  router.put('/config', (req: Request, res: Response) => {
    const schema = roomConfigPatchSchema.extend({
      roomId: z.union([z.number(), z.string()]),
      appId: z.union([z.number(), z.string()]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'INTERNAL', '配置无效');
      return;
    }

    const roomId = parsed.data.roomId;
    const appId = String(parsed.data.appId ?? loadEnv().biliAppId);
    const partial = toRoomConfigPartial(parsed.data);
    const roomNum = typeof roomId === 'number' ? roomId : Number(roomId);
    const config = Number.isFinite(roomNum)
      ? roomHub.updateConfig(roomNum, appId, partial)
      : configStore.put(roomId, appId, partial);
    res.json({ roomId, appId, config });
  });

  /** Health */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err instanceof Error ? err.message : err);
    sendError(res, 500, 'INTERNAL');
  });

  return router;
}
