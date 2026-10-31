import type { DanmakuConfig } from '../types/config';
import type { DanmakuEvent } from '../types/events';

/** Case-insensitive substring match. Blank keywords never match. */
export function matchesKeyword(text: string, keywords: readonly string[]): boolean {
  if (!text || keywords.length === 0) return false;
  const hay = text.toLowerCase();
  for (const raw of keywords) {
    const needle = raw.trim().toLowerCase();
    if (needle && hay.includes(needle)) return true;
  }
  return false;
}

/**
 * Drop when disabled or blockKeywords hit (no error event).
 * highlightKeywords set `highlight: true`. `text` mirrors `msg`.
 */
export function applyDanmakuPolicy(ev: DanmakuEvent, cfg: DanmakuConfig): DanmakuEvent | null {
  if (!cfg.enabled) return null;
  const text = ev.text || ev.msg;
  if (matchesKeyword(text, cfg.blockKeywords)) return null;

  const out: DanmakuEvent = { ...ev, msg: text, text };
  if (!cfg.showAvatar) delete out.avatar;
  if (matchesKeyword(text, cfg.highlightKeywords)) out.highlight = true;
  else delete out.highlight;
  return out;
}
