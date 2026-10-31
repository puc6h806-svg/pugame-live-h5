import crypto from 'crypto';

export interface SignCredentials {
  accessKeyId: string;
  accessKeySecret: string;
}

export interface SignedHeaders {
  Accept: string;
  'Content-Type': string;
  'x-bili-content-md5': string;
  'x-bili-timestamp': string;
  'x-bili-signature-method': string;
  'x-bili-signature-nonce': string;
  'x-bili-accesskeyid': string;
  'x-bili-signature-version': string;
  Authorization: string;
}

/**
 * Build the canonical string to sign from x-bili-* headers (lexicographic order).
 * Last line has no trailing newline (per official demo).
 */
export function buildSignString(params: {
  accessKeyId: string;
  contentMd5: string;
  signatureNonce: string;
  timestamp: string;
}): string {
  const lines = [
    `x-bili-accesskeyid:${params.accessKeyId}`,
    `x-bili-content-md5:${params.contentMd5}`,
    `x-bili-signature-method:HMAC-SHA256`,
    `x-bili-signature-nonce:${params.signatureNonce}`,
    `x-bili-signature-version:1.0`,
    `x-bili-timestamp:${params.timestamp}`,
  ];
  return lines.join('\n');
}

/** HMAC-SHA256 hex digest (lowercase) of the canonical header string. */
export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/** MD5 hex digest of the raw request body string. */
export function md5Hex(body: string): string {
  return crypto.createHash('md5').update(body, 'utf8').digest('hex');
}

/**
 * Produce signed request headers for a JSON body string.
 * Body must be the exact UTF-8 string that will be sent (MD5 is over that string).
 */
export function signRequest(
  body: string,
  credentials: SignCredentials,
  options?: { timestamp?: string; nonce?: string },
): SignedHeaders {
  const contentMd5 = md5Hex(body);
  const timestamp = options?.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signatureNonce = options?.nonce ?? crypto.randomUUID();

  const toSign = buildSignString({
    accessKeyId: credentials.accessKeyId,
    contentMd5,
    signatureNonce,
    timestamp,
  });

  const authorization = hmacSha256Hex(credentials.accessKeySecret, toSign);

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-bili-content-md5': contentMd5,
    'x-bili-timestamp': timestamp,
    'x-bili-signature-method': 'HMAC-SHA256',
    'x-bili-signature-nonce': signatureNonce,
    'x-bili-accesskeyid': credentials.accessKeyId,
    'x-bili-signature-version': '1.0',
    Authorization: authorization,
  };
}
