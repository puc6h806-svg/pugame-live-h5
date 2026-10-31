/**
 * Cloudflare Worker — same-origin front for pugame.site
 *
 * Goal: browser hits https://pugame.site/  (static H5)
 *                  https://pugame.site/api… (Node backend)
 *                  https://pugame.site/ws…  (WebSocket Upgrade → Node)
 *
 * Setup sketch:
 * 1. Deploy frontend to Cloudflare Pages (project e.g. "pugame").
 * 2. Put Node backend behind a private HTTPS origin:
 *      - Named Tunnel URL, or
 *      - VPS with TLS, or
 *      - CF Tunnel to localhost:8787
 * 3. Worker settings → Variables:
 *      BACKEND_ORIGIN = https://your-backend-origin.example  (no trailing slash)
 *      PAGES_ORIGIN   = https://pugame.<account>.pages.dev  (or custom Pages URL)
 *    Optional: bind Pages as a service binding instead of fetch(PAGES_ORIGIN).
 * 4. Routes: pugame.site/*  (and www if used) → this Worker.
 * 5. Confirm embed headers on / (never SAMEORIGIN).
 *
 * Replace placeholders; do not commit real tokens.
 */

const EMBED_HEADERS = {
  "X-Frame-Options": "ALLOW-FROM https://play-live.bilibili.com/",
  "Content-Security-Policy":
    "frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'",
};

function withEmbed(res) {
  const h = new Headers(res.headers);
  // Override any upstream SAMEORIGIN / DENY
  h.delete("X-Frame-Options");
  h.set("X-Frame-Options", EMBED_HEADERS["X-Frame-Options"]);
  h.set("Content-Security-Policy", EMBED_HEADERS["Content-Security-Policy"]);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: h,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const backend = (env.BACKEND_ORIGIN || "").replace(/\/$/, "");
    const pages = (env.PAGES_ORIGIN || "").replace(/\/$/, "");

    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const isWs =
      url.pathname === "/ws" || url.pathname.startsWith("/ws/") || url.pathname === "/ws";

    // WebSocket + HTTP API → backend
    if (isApi || isWs || url.pathname.startsWith("/ws")) {
      if (!backend) {
        return new Response("BACKEND_ORIGIN not configured", { status: 502 });
      }
      const target = new URL(url.pathname + url.search, backend + "/");
      const init = {
        method: request.method,
        headers: request.headers,
        redirect: "manual",
      };
      // Preserve body for non-GET/HEAD
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
        // @ts-expect-error — Workers duplex for streaming bodies
        init.duplex = "half";
      }
      // Upgrade: fetch handles WebSocket when client sends Upgrade
      const res = await fetch(new Request(target.toString(), init));
      // Do not force embed headers on API JSON; only on HTML static below
      return res;
    }

    // Static H5 from Pages (or ASSETS binding if configured)
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const res = await env.ASSETS.fetch(request);
      return withEmbed(res);
    }
    if (!pages) {
      return new Response("PAGES_ORIGIN (or ASSETS binding) not configured", {
        status: 502,
      });
    }
    const assetUrl = new URL(url.pathname + url.search, pages + "/");
    const res = await fetch(
      new Request(assetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        redirect: "manual",
      }),
    );
    return withEmbed(res);
  },
};
