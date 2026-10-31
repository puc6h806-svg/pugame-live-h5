/** Same limits as blive-h5-backend `normalizeKeywords` / zod keyword schema. */
export const KEYWORD_MAX = 20
export const KEYWORD_MAX_LEN = 64

/**
 * Trim, drop blanks and over-long items, case-insensitive dedupe, then keep at most 20.
 * Mirrors backend `normalizeKeywords` (store clamp). The settings form does not use this
 * to hide overflow — it shows a Chinese error instead. See `parseKeywordDraft`.
 */
export function clampKeywords(list: readonly unknown[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (typeof item !== 'string') continue
    const s = item.trim()
    if (!s || s.length > KEYWORD_MAX_LEN) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= KEYWORD_MAX) break
  }
  return out
}

/** Case-insensitive substring. Blank keywords never match. Same rule as the backend. */
export function matchesKeyword(text: string, keywords: readonly string[]): boolean {
  if (!text || keywords.length === 0) return false
  const hay = text.toLowerCase()
  for (const raw of keywords) {
    const needle = raw.trim().toLowerCase()
    if (needle && hay.includes(needle)) return true
  }
  return false
}

export interface KeywordDraft {
  /** Clamped list (≤20). Not written through while `error` is set. */
  keywords: string[]
  /** Unique in-range tokens before the cap. May be greater than 20. */
  count: number
  error: string | null
}

function countUnique(tokens: readonly string[]): number {
  const seen = new Set<string>()
  for (const raw of tokens) {
    const s = raw.trim()
    if (!s || s.length > KEYWORD_MAX_LEN) continue
    seen.add(s.toLowerCase())
  }
  return seen.size
}

/**
 * Parse a textarea (newline / comma separated) into a keyword list.
 * Over 20 unique keywords, or any token longer than 64, returns a Chinese error
 * and does not silently drop the overflow.
 */
export function parseKeywordDraft(text: string, label: string): KeywordDraft {
  const parts = text.split(/[\n,，、]+/)
  const tokens: string[] = []
  for (const part of parts) {
    const s = part.trim()
    if (!s) continue
    if (s.length > KEYWORD_MAX_LEN) {
      return {
        keywords: clampKeywords(tokens),
        count: countUnique(tokens),
        error: `单个${label}最长 ${KEYWORD_MAX_LEN} 个字符`,
      }
    }
    tokens.push(s)
  }
  const count = countUnique(tokens)
  if (count > KEYWORD_MAX) {
    return {
      keywords: clampKeywords(tokens),
      count,
      error: `${label}最多 ${KEYWORD_MAX} 个`,
    }
  }
  return { keywords: clampKeywords(tokens), count, error: null }
}

export interface PreviewDanmaku {
  msg: string
  text?: string
  highlight?: boolean
}

/**
 * Settings-preview only. Simulates the server keyword policy on sample lines:
 * blockKeywords drop the line; highlightKeywords set `highlight`.
 * Runtime does not call this — the backend already filtered and flagged events.
 */
export function applyKeywordPreview<T extends PreviewDanmaku>(
  items: readonly T[],
  keywords: { highlightKeywords?: readonly string[]; blockKeywords?: readonly string[] },
): T[] {
  const highlightKeywords = keywords.highlightKeywords ?? []
  const blockKeywords = keywords.blockKeywords ?? []
  const out: T[] = []
  for (const ev of items) {
    const text = ev.text || ev.msg
    if (matchesKeyword(text, blockKeywords)) continue
    const next = { ...ev, msg: text }
    if (matchesKeyword(text, highlightKeywords)) next.highlight = true
    else delete next.highlight
    out.push(next)
  }
  return out
}
