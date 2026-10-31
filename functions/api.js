// Pages Function for /api. Must live in a real ./functions directory:
// wrangler 3.90 (what wrangler-action installs) resolves the bundle path
// relative to this directory, and a symlink makes that path miss the file.
import { proxyToBackend } from "../cloudflare/worker-same-origin.js";

export function onRequest(context) {
  return proxyToBackend(context.request, context.env);
}
