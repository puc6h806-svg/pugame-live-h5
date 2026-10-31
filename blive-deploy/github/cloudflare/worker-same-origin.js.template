/**
 * Cloudflare Worker — same-origin front for pugame.site
 *
 * Pages project (no zone required):
 *   functions/* calls proxyToBackend() for /api and /ws.
 *   Static HTML keeps cloudflare/_headers (ALLOW-FROM + frame-ancestors).
 * Workers cannot fetch() a raw IP (Cloudflare error 1003). An http:// IP
 * origin is dialed with cloudflare:sockets instead, Host set to that IP:port.
 *
 * Standalone Worker (workers.dev, or a route after this account has the zone):
 *   /api* and /ws* → BACKEND_ORIGIN
 *   everything else → env.ASSETS or PAGES_ORIGIN
 *   HTML / static responses get the bilibili embed headers below.
 *
 * BACKEND_ORIGIN and PAGES_ORIGIN are plain config, not secrets.
 * Defaults match the Pages project pugame-live-h5. env vars override them.
 *
 * When proxying, clone request headers and drop host / cf-* / x-forwarded-*.
 * Forwarding the workers.dev Host made the upstream return HTTP 500.
 */

const EMBED_HEADERS = {
  "X-Frame-Options": "ALLOW-FROM https://play-live.bilibili.com/",
  "Content-Security-Policy":
    "frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

export const DEFAULT_BACKEND_ORIGIN = "http://111.231.164.192:8787";
export const DEFAULT_PAGES_ORIGIN = "https://pugame-live-h5.pages.dev";

export function headersForUpstream(request) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  for (const key of [...headers.keys()]) {
    const name = key.toLowerCase();
    if (name.startsWith("cf-") || name.startsWith("x-forwarded-")) {
      headers.delete(key);
    }
  }
  return headers;
}

function originValue(value, fallback) {
  return (value || fallback || "").replace(/\/$/, "");
}

function upstreamRequest(request, target) {
  const init = {
    method: request.method,
    headers: headersForUpstream(request),
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(target.toString(), init);
}

export function isIpHostname(hostname) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return hostname.split(".").every((part) => Number(part) <= 255);
  }
  return hostname.includes(":");
}

export function buildOriginRequestHead(method, target, headers) {
  const path = `${target.pathname}${target.search}` || "/";
  const lines = [`${method} ${path} HTTP/1.1`];
  for (const [key, value] of headers) {
    lines.push(`${key}: ${value}`);
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function concatBytes(parts) {
  let length = 0;
  for (const part of parts) length += part.byteLength;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function originHostHeader(target) {
  return target.port ? `${target.hostname}:${target.port}` : target.hostname;
}

export function encodeClientFrame(opcode, payload) {
  const data =
    typeof payload === "string" ? textEncoder.encode(payload) : payload;
  const mask = crypto.getRandomValues(new Uint8Array(4));
  const length = data.length;
  let header;
  if (length < 126) {
    header = new Uint8Array(2);
    header[1] = 0x80 | length;
  } else if (length < 65536) {
    header = new Uint8Array(4);
    header[1] = 0x80 | 126;
    header[2] = (length >> 8) & 0xff;
    header[3] = length & 0xff;
  } else {
    header = new Uint8Array(10);
    header[1] = 0x80 | 127;
    new DataView(header.buffer).setUint32(6, length);
  }
  header[0] = 0x80 | (opcode & 0x0f);
  const masked = new Uint8Array(length);
  for (let i = 0; i < length; i++) masked[i] = data[i] ^ mask[i % 4];
  return concatBytes([header, mask, masked]);
}

export function takeFrames(input) {
  const frames = [];
  let offset = 0;
  const buf = input;
  while (buf.length - offset >= 2) {
    const first = buf[offset];
    const second = buf[offset + 1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (buf.length - offset < 4) break;
      length = (buf[offset + 2] << 8) | buf[offset + 3];
      headerLength = 4;
    } else if (length === 127) {
      if (buf.length - offset < 10) break;
      length = new DataView(buf.buffer, buf.byteOffset + offset + 6, 4).getUint32(0);
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const total = headerLength + maskLength + length;
    if (buf.length - offset < total) break;
    let payload = buf.slice(offset + headerLength + maskLength, offset + total);
    if (masked) {
      const mask = buf.subarray(offset + headerLength, offset + headerLength + 4);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    frames.push({ fin, opcode, payload });
    offset += total;
  }
  return { frames, rest: buf.slice(offset) };
}

function findHeaderEnd(buf) {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (
      buf[i] === 13 &&
      buf[i + 1] === 10 &&
      buf[i + 2] === 13 &&
      buf[i + 3] === 10
    ) {
      return i;
    }
  }
  return -1;
}

function responseFromHttpBuffer(buf) {
  const headerEnd = findHeaderEnd(buf);
  if (headerEnd < 0) {
    return new Response("origin response had no headers", { status: 502 });
  }
  const headerText = textDecoder.decode(buf.subarray(0, headerEnd));
  const lines = headerText.split("\r\n");
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d+)/.exec(lines[0] || "");
  const status = statusMatch ? Number(statusMatch[1]) : 502;
  const headers = new Headers();
  let chunked = false;
  for (const line of lines.slice(1)) {
    const splitAt = line.indexOf(":");
    if (splitAt <= 0) continue;
    const name = line.slice(0, splitAt).trim();
    const value = line.slice(splitAt + 1).trim();
    if (name.toLowerCase() === "transfer-encoding" && value.toLowerCase().includes("chunked")) {
      chunked = true;
    }
    headers.append(name, value);
  }
  headers.delete("transfer-encoding");
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("content-length");
  let body = buf.subarray(headerEnd + 4);
  if (chunked) body = decodeChunked(body);
  return new Response(body, { status, headers });
}

function decodeChunked(buf) {
  const parts = [];
  let offset = 0;
  while (offset < buf.length) {
    let lineEnd = -1;
    for (let i = offset; i + 1 < buf.length; i++) {
      if (buf[i] === 13 && buf[i + 1] === 10) {
        lineEnd = i;
        break;
      }
    }
    if (lineEnd < 0) break;
    const size = Number.parseInt(textDecoder.decode(buf.subarray(offset, lineEnd)).split(";")[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = lineEnd + 2;
    parts.push(buf.subarray(start, start + size));
    offset = start + size + 2;
  }
  return concatBytes(parts);
}

async function openOriginSocket(target) {
  const { connect } = await import("cloudflare:sockets");
  const port = Number(target.port || 80);
  return connect(
    { hostname: target.hostname, port },
    { secureTransport: "off", allowHalfOpen: true },
  );
}

function socketHeaders(request, target, websocket) {
  const headers = headersForUpstream(request);
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("transfer-encoding");
  headers.delete("upgrade");
  headers.delete("sec-websocket-extensions");
  headers.set("host", originHostHeader(target));
  if (websocket) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    headers.set("upgrade", "websocket");
    headers.set("connection", "Upgrade");
    headers.set("sec-websocket-version", "13");
    headers.set("sec-websocket-key", btoa(binary));
  } else {
    headers.set("connection", "close");
  }
  return headers;
}

async function proxyHttpOverSocket(request, target) {
  const socket = await openOriginSocket(target);
  const headers = socketHeaders(request, target, false);
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? null
      : new Uint8Array(await request.arrayBuffer());
  if (body) headers.set("content-length", String(body.byteLength));
  const writer = socket.writable.getWriter();
  await writer.write(textEncoder.encode(buildOriginRequestHead(request.method, target, headers)));
  if (body && body.byteLength) await writer.write(body);
  const raw = await readHttpMessage(socket.readable);
  await writer.close().catch(() => {});
  if (findHeaderEnd(raw) < 0) {
    const preview = textDecoder.decode(raw.subarray(0, 160)).replace(/\s+/g, " ");
    return new Response(
      `origin response had no headers (${raw.byteLength} bytes)${preview ? `: ${preview}` : ""}`,
      { status: 502 },
    );
  }
  return responseFromHttpBuffer(raw);
}

async function readHttpMessage(readable) {
  const reader = readable.getReader();
  let buf = new Uint8Array(0);
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (httpMessageComplete(buf)) return buf;
    let next;
    try {
      next = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("origin timeout")), Math.max(1, deadline - Date.now()));
        }),
      ]);
    } catch (err) {
      if (buf.byteLength) return buf;
      throw err;
    }
    if (next.done) return buf;
    buf = concatBytes([buf, next.value]);
    if (buf.length > 8_000_000) return buf;
  }
  return buf;
}

function httpMessageComplete(buf) {
  const headerEnd = findHeaderEnd(buf);
  if (headerEnd < 0) return false;
  const headerText = textDecoder.decode(buf.subarray(0, headerEnd)).toLowerCase();
  const statusLine = headerText.split("\r\n", 1)[0] || "";
  if (/\s204\b/.test(statusLine) || /\s304\b/.test(statusLine)) return true;
  const body = buf.subarray(headerEnd + 4);
  const lengthMatch = /(?:^|\r\n)content-length:\s*(\d+)/.exec(headerText);
  if (lengthMatch) return body.byteLength >= Number(lengthMatch[1]);
  if (/(?:^|\r\n)transfer-encoding:\s*chunked/.test(headerText)) {
    return body.byteLength >= 5 && textDecoder.decode(body.slice(-5)) === "0\r\n\r\n";
  }
  return false;
}

function isWebSocket(request) {
  const upgrade = request.headers.get("upgrade") || "";
  return upgrade.toLowerCase() === "websocket" || request.headers.has("sec-websocket-key");
}

async function proxyWebSocketOverSocket(request, target) {
  const socket = await openOriginSocket(target);
  const headers = socketHeaders(request, target, true);
  const writer = socket.writable.getWriter();
  await writer.write(
    textEncoder.encode(buildOriginRequestHead(request.method || "GET", target, headers)),
  );

  const reader = socket.readable.getReader();
  let pending = new Uint8Array(0);
  while (findHeaderEnd(pending) < 0) {
    const { done, value } = await reader.read();
    if (done) return new Response("origin closed during websocket handshake", { status: 502 });
    pending = concatBytes([pending, value]);
    if (pending.length > 65_536) {
      return new Response("origin handshake too large", { status: 502 });
    }
  }
  const headerEnd = findHeaderEnd(pending);
  const handshake = responseFromHttpBuffer(pending.subarray(0, headerEnd + 4));
  if (handshake.status !== 101) return handshake;

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  let rest = pending.subarray(headerEnd + 4);
  let writeChain = Promise.resolve();
  const sendToOrigin = (bytes) => {
    writeChain = writeChain.then(() => writer.write(bytes)).catch(() => server.close());
  };

  let fragOpcode = 0;
  const fragParts = [];
  const emit = ({ fin, opcode, payload }) => {
    const op = opcode === 0 ? fragOpcode : opcode;
    if (opcode !== 0) fragOpcode = opcode;
    if (!fin) {
      fragParts.push(payload);
      return;
    }
    const message = fragParts.length ? concatBytes([...fragParts, payload]) : payload;
    fragParts.length = 0;
    if (op === 0x1) server.send(textDecoder.decode(message));
    else if (op === 0x2) server.send(message);
    else if (op === 0x8) server.close();
    else if (op === 0x9) sendToOrigin(encodeClientFrame(0xa, message));
  };

  const consume = (chunk) => {
    const { frames, rest: leftover } = takeFrames(concatBytes([rest, chunk || new Uint8Array()]));
    rest = leftover;
    for (const frame of frames) emit(frame);
  };
  if (rest.byteLength) consume(new Uint8Array());

  const pump = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        consume(value);
      }
    } catch {
      /* origin socket ended */
    }
    try {
      server.close();
    } catch {
      /* already closed */
    }
  };
  pump();

  server.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      sendToOrigin(encodeClientFrame(0x1, event.data));
      return;
    }
    const bytes =
      event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : new Uint8Array(event.data);
    sendToOrigin(encodeClientFrame(0x2, bytes));
  });
  server.addEventListener("close", () => {
    sendToOrigin(encodeClientFrame(0x8, new Uint8Array([0x03, 0xe8])));
    writeChain.then(() => writer.close()).catch(() => {});
  });

  return new Response(null, { status: 101, webSocket: client });
}

async function proxyIpOrigin(request, target) {
  try {
    if (target.protocol !== "http:") {
      return new Response("IP origin must be http://", { status: 502 });
    }
    if (isWebSocket(request)) return await proxyWebSocketOverSocket(request, target);
    return await proxyHttpOverSocket(request, target);
  } catch (err) {
    const message = err instanceof Error ? err.message : "origin connect failed";
    return new Response(`backend unreachable: ${message}`, { status: 502 });
  }
}

export async function proxyToBackend(request, env) {
  const backend = originValue(env?.BACKEND_ORIGIN, DEFAULT_BACKEND_ORIGIN);
  if (!backend) {
    return new Response("BACKEND_ORIGIN not configured", { status: 502 });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, `${backend}/`);
  if (isIpHostname(target.hostname)) return proxyIpOrigin(request, target);
  return fetch(upstreamRequest(request, target));
}

function withEmbed(res) {
  const headers = new Headers(res.headers);
  headers.delete("X-Frame-Options");
  for (const [key, value] of Object.entries(EMBED_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isWs = url.pathname === "/ws" || url.pathname.startsWith("/ws/");

    if (isApi || isWs) {
      return proxyToBackend(request, env);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const res = await env.ASSETS.fetch(request);
      return withEmbed(res);
    }

    const pages = originValue(env?.PAGES_ORIGIN, DEFAULT_PAGES_ORIGIN);
    if (!pages) {
      return new Response("PAGES_ORIGIN (or ASSETS binding) not configured", {
        status: 502,
      });
    }
    const assetUrl = new URL(url.pathname + url.search, `${pages}/`);
    const res = await fetch(upstreamRequest(request, assetUrl));
    return withEmbed(res);
  },
};
