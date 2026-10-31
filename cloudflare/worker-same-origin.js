/**
 * Cloudflare Worker — same-origin front for pugame.site
 *
 * Pages project (no zone required):
 *   cloudflare/functions/* calls proxyToBackend() for /api and /ws.
 *   Static HTML keeps cloudflare/_headers (ALLOW-FROM + frame-ancestors).
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

export async function proxyToBackend(request, env) {
  const backend = originValue(env?.BACKEND_ORIGIN, DEFAULT_BACKEND_ORIGIN);
  if (!backend) {
    return new Response("BACKEND_ORIGIN not configured", { status: 502 });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, `${backend}/`);
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
