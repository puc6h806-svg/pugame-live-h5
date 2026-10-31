import jwt from 'jsonwebtoken';
import { loadEnv } from '../utils/env';

export interface SessionPayload {
  roomId: number;
  gameId: string;
  appId: string;
  /** Anchor display name (public). */
  uname: string;
  uFace?: string;
}

export interface SignedSession {
  token: string;
  expiresIn: number;
}

const DEFAULT_TTL_SEC = 6 * 60 * 60; // 6 hours

export function issueSessionToken(payload: SessionPayload, ttlSec = DEFAULT_TTL_SEC): SignedSession {
  const { sessionSecret } = loadEnv();
  const token = jwt.sign(
    {
      roomId: payload.roomId,
      gameId: payload.gameId,
      appId: payload.appId,
      uname: payload.uname,
      uFace: payload.uFace,
    },
    sessionSecret,
    { expiresIn: ttlSec, algorithm: 'HS256' },
  );
  return { token, expiresIn: ttlSec };
}

export function verifySessionToken(token: string): SessionPayload & { exp?: number } {
  const { sessionSecret } = loadEnv();
  const decoded = jwt.verify(token, sessionSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  if (
    typeof decoded.roomId !== 'number' ||
    typeof decoded.gameId !== 'string' ||
    typeof decoded.appId !== 'string'
  ) {
    throw new Error('Invalid session token payload');
  }
  return {
    roomId: decoded.roomId,
    gameId: decoded.gameId,
    appId: decoded.appId,
    uname: typeof decoded.uname === 'string' ? decoded.uname : '',
    uFace: typeof decoded.uFace === 'string' ? decoded.uFace : undefined,
    exp: typeof decoded.exp === 'number' ? decoded.exp : undefined,
  };
}
