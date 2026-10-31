import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function optionalEnv(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export interface AppEnv {
  biliAccessKeyId: string;
  biliAccessKeySecret: string;
  /** Numeric app id as string; sent as number in JSON body (int64-safe). */
  biliAppId: string;
  sessionSecret: string;
  port: number;
  allowedOrigins: string[];
}

let cached: AppEnv | null = null;

export function loadEnv(): AppEnv {
  if (cached) return cached;

  const biliAppId = requireEnv('BILI_APP_ID');
  if (!/^\d+$/.test(biliAppId)) {
    throw new Error('BILI_APP_ID must be a numeric string');
  }

  const originsRaw = optionalEnv('ALLOWED_ORIGINS');
  const allowedOrigins = originsRaw
    ? originsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  cached = {
    biliAccessKeyId: requireEnv('BILI_ACCESS_KEY_ID'),
    biliAccessKeySecret: requireEnv('BILI_ACCESS_KEY_SECRET'),
    biliAppId,
    sessionSecret: requireEnv('SESSION_SECRET'),
    port: Number(optionalEnv('PORT', '8787')) || 8787,
    allowedOrigins,
  };
  return cached;
}

/** Soft load for tests / typecheck without forcing secrets. */
export function tryLoadEnv(): AppEnv | null {
  try {
    return loadEnv();
  } catch {
    return null;
  }
}

export function getAppIdNumber(): number {
  const { biliAppId } = loadEnv();
  // 13-digit ids fit in Number.MAX_SAFE_INTEGER
  return Number(biliAppId);
}
