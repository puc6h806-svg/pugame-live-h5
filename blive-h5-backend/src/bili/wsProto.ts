import zlib from 'zlib';

/** Operation codes (official long-conn protocol). */
export const OP_HEARTBEAT = 2;
export const OP_HEARTBEAT_REPLY = 3;
export const OP_SEND_SMS_REPLY = 5;
export const OP_AUTH = 7;
export const OP_AUTH_REPLY = 8;

const HEADER_LENGTH = 16;

export interface ProtoPacket {
  packetLen: number;
  headerLen: number;
  version: number;
  operation: number;
  sequence: number;
  body: Buffer;
}

/** Encode a protocol packet (big-endian). */
export function encodePacket(operation: number, body: Buffer | string = Buffer.alloc(0), sequence = 1): Buffer {
  const bodyBuf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  const packetLen = HEADER_LENGTH + bodyBuf.length;
  const buf = Buffer.alloc(packetLen);
  buf.writeUInt32BE(packetLen, 0);
  buf.writeUInt16BE(HEADER_LENGTH, 4);
  buf.writeUInt16BE(0, 6); // version 0 for client→server
  buf.writeInt32BE(operation, 8);
  buf.writeInt32BE(sequence, 12);
  bodyBuf.copy(buf, HEADER_LENGTH);
  return buf;
}

export function encodeAuth(authBody: string): Buffer {
  return encodePacket(OP_AUTH, authBody);
}

export function encodeHeartbeat(): Buffer {
  return encodePacket(OP_HEARTBEAT, Buffer.alloc(0));
}

/**
 * Parse one or more packets from a buffer.
 * Version=2 bodies are zlib-compressed and may contain nested packets (recursive).
 */
export function decodePackets(data: Buffer): ProtoPacket[] {
  const out: ProtoPacket[] = [];
  let offset = 0;

  while (offset + HEADER_LENGTH <= data.length) {
    const packetLen = data.readUInt32BE(offset);
    if (packetLen < HEADER_LENGTH || offset + packetLen > data.length) {
      break;
    }
    const headerLen = data.readUInt16BE(offset + 4);
    const version = data.readUInt16BE(offset + 6);
    const operation = data.readInt32BE(offset + 8);
    const sequence = data.readInt32BE(offset + 12);
    const body = data.subarray(offset + headerLen, offset + packetLen);
    offset += packetLen;

    if (version === 2 && body.length > 0) {
      try {
        const inflated = zlib.inflateSync(body);
        out.push(...decodePackets(inflated));
        continue;
      } catch {
        // fall through with raw body
      }
    }

    out.push({ packetLen, headerLen, version, operation, sequence, body });
  }

  return out;
}

/** Try parse body as UTF-8 JSON; return null on failure. */
export function parseBodyJson(body: Buffer): unknown | null {
  if (!body.length) return null;
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
}
