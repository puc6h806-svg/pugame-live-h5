import { proxyToBackend } from "../../worker-same-origin.js";

export function onRequest(context) {
  return proxyToBackend(context.request, context.env);
}