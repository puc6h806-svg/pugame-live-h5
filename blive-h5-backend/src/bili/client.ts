import { loadEnv, getAppIdNumber } from '../utils/env';
import { signRequest, type SignCredentials } from './sign';

const API_BASE = 'https://live-open.biliapi.com';

export interface BiliApiResponse<T> {
  code: number;
  message: string;
  request_id?: string;
  data: T;
}

export interface GameInfo {
  game_id: string;
}

export interface WebsocketInfo {
  auth_body: string;
  wss_link: string[];
}

export interface AnchorInfo {
  room_id: number;
  uname: string;
  uface: string;
  uid?: number;
  open_id?: string;
  union_id?: string;
}

export interface StartData {
  game_info: GameInfo;
  websocket_info: WebsocketInfo;
  anchor_info: AnchorInfo;
}

export class BiliApiError extends Error {
  readonly code: number;
  readonly requestId?: string;

  constructor(code: number, message: string, requestId?: string) {
    super(message || `Bili API error ${code}`);
    this.name = 'BiliApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

function credentials(): SignCredentials {
  const env = loadEnv();
  return {
    accessKeyId: env.biliAccessKeyId,
    accessKeySecret: env.biliAccessKeySecret,
  };
}

/**
 * Signed POST to live-open.biliapi.com.
 * Body is JSON-stringified once so MD5 matches the wire bytes.
 */
export async function signedPost<T>(
  path: string,
  bodyObj: Record<string, unknown>,
): Promise<BiliApiResponse<T>> {
  const body = JSON.stringify(bodyObj);
  const headers = signRequest(body, credentials());
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers },
    body,
  });

  // Official: HTTP status is always 200; business code is in JSON.
  let json: BiliApiResponse<T>;
  try {
    json = (await res.json()) as BiliApiResponse<T>;
  } catch {
    throw new BiliApiError(5002, `Invalid JSON from ${path} (http ${res.status})`);
  }

  if (json.code !== 0) {
    throw new BiliApiError(json.code, json.message || 'error', json.request_id);
  }
  return json;
}

/** POST /v2/app/start — identity code → game_id + WS auth. */
export async function appStart(code: string): Promise<StartData> {
  const app_id = getAppIdNumber();
  const res = await signedPost<StartData>('/v2/app/start', { code, app_id });
  return res.data;
}

/** POST /v2/app/end — must be called when session ends. */
export async function appEnd(gameId: string): Promise<void> {
  const app_id = getAppIdNumber();
  await signedPost('/v2/app/end', { app_id, game_id: gameId });
}

/** POST /v2/app/heartbeat — every ~20s while game_id is alive. */
export async function appHeartbeat(gameId: string): Promise<void> {
  await signedPost('/v2/app/heartbeat', { game_id: gameId });
}

/** Map Bili business codes to our ErrorCode-ish tags. */
export function mapBiliCode(code: number): 'UNAUTHORIZED' | 'ROOM_LIMIT' | 'INTERNAL' {
  // Auth / identity / signature / access issues
  if (
    code === 4001 ||
    code === 4002 ||
    code === 4003 ||
    code === 4004 ||
    code === 4005 ||
    code === 4006 ||
    code === 4008 ||
    code === 7007 ||
    code === 4012
  ) {
    return 'UNAUTHORIZED';
  }
  // 7010: same app per room max 5 connections
  if (code === 7010 || code === 7002 || code === 7008) {
    return 'ROOM_LIMIT';
  }
  return 'INTERNAL';
}
