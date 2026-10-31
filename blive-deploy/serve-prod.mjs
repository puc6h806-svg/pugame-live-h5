#!/usr/bin/env node
/**
 * Same-origin prod edge: static H5 + /api + /ws → backend :8787
 * Embed headers for Bilibili live console iframe.
 */
import express from 'express';
import http from 'http';
import httpProxy from 'http-proxy';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.EDGE_PORT || 8080);
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8787';
const STATIC_ROOT =
  process.env.STATIC_ROOT || path.resolve(__dirname, 'current');

const FRAME_ANCESTORS =
  "frame-ancestors https://play-live.bilibili.com https://*.bilibili.com 'self'";
const XFO = 'ALLOW-FROM https://play-live.bilibili.com/';

function applyEmbed(res) {
  res.setHeader('Content-Security-Policy', FRAME_ANCESTORS);
  res.setHeader('X-Frame-Options', XFO);
}

function embedHeaders(_req, res, next) {
  applyEmbed(res);
  next();
}

const root = fs.existsSync(path.join(STATIC_ROOT, 'index.html'))
  ? STATIC_ROOT
  : path.resolve(__dirname, '../bilibili-live-h5-plugin/dist');

const app = express();
app.disable('x-powered-by');
app.use(embedHeaders);

const proxy = httpProxy.createProxyServer({
  target: BACKEND,
  ws: true,
  changeOrigin: true,
  xfwd: true,
});

proxy.on('error', (err, _req, res) => {
  console.error('[proxy]', err.message);
  if (res && !res.headersSent && typeof res.writeHead === 'function') {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  } else if (res && res.destroy) {
    res.destroy();
  }
});

app.use('/api', (req, res) => {
  // restore /api prefix stripped by mount? express mount strips; re-add
  req.url = '/api' + (req.url === '/' ? '' : req.url);
  proxy.web(req, res, { target: BACKEND });
});

app.use('/ws', (req, res) => {
  req.url = '/ws' + (req.url === '/' ? '' : req.url);
  proxy.web(req, res, { target: BACKEND });
});

app.use(
  express.static(root, {
    index: 'index.html',
    setHeaders(res) {
      applyEmbed(res);
    },
  }),
);

// SPA fallback (Express 5-safe: no bare "*")
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  applyEmbed(res);
  res.sendFile(path.join(root, 'index.html'), (err) => {
    if (err) next(err);
  });
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  if (req.url && (req.url.startsWith('/ws') || req.url.startsWith('/api'))) {
    proxy.ws(req, socket, head, { target: BACKEND });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[serve-prod] http://0.0.0.0:${PORT} → static ${root} | proxy ${BACKEND}`,
  );
});
