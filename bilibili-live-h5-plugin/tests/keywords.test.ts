import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isHighlighted } from '../src/lib/highlight.ts'
import {
  KEYWORD_MAX,
  applyKeywordPreview,
  clampKeywords,
  matchesKeyword,
  parseKeywordDraft,
} from '../src/lib/keywords.ts'

test('clampKeywords trims, drops blanks and over-long, dedupes, caps at 20', () => {
  const many = Array.from({ length: 25 }, (_, i) => ` 词${i} `)
  const clamped = clampKeywords([' 你好 ', '', '  ', '你好', 'VIP', 'vip', 'x'.repeat(65), ...many, 1])
  assert.equal(clamped[0], '你好')
  assert.equal(clamped[1], 'VIP')
  assert.equal(clamped.includes('x'.repeat(65)), false)
  assert.equal(clamped.length, KEYWORD_MAX)
  assert.equal(clamped.filter((k) => k.toLowerCase() === 'vip').length, 1)
})

test('parseKeywordDraft rejects more than 20 and over-long tokens in Chinese', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `k${i}`).join('\n')
  const ok = parseKeywordDraft(twenty, '高亮关键词')
  assert.equal(ok.error, null)
  assert.equal(ok.keywords.length, 20)

  const over = parseKeywordDraft(`${twenty}\n多余`, '高亮关键词')
  assert.equal(over.error, '高亮关键词最多 20 个')

  const block = parseKeywordDraft(
    ['广告', ...Array.from({ length: 20 }, (_, i) => `b${i}`)].join(','),
    '屏蔽关键词',
  )
  assert.equal(block.error, '屏蔽关键词最多 20 个')

  const long = parseKeywordDraft('a'.repeat(65), '高亮关键词')
  assert.equal(long.error, '单个高亮关键词最长 64 个字符')

  const commas = parseKeywordDraft(' 高能，广告、前方 ', '高亮关键词')
  assert.deepEqual(commas.keywords, ['高能', '广告', '前方'])
  assert.equal(commas.error, null)
})

test('isHighlighted is true only for highlight:true', () => {
  assert.equal(isHighlighted({ highlight: true }), true)
  assert.equal(isHighlighted({ highlight: false }), false)
  assert.equal(isHighlighted({}), false)
  assert.equal(isHighlighted(undefined), false)
})

test('applyKeywordPreview mirrors server keyword policy on sample lines', () => {
  const items = [
    { id: 'a', msg: '前方高能', text: '前方高能' },
    { id: 'b', msg: '这是广告', highlight: true },
    { id: 'c', msg: '普通弹幕' },
  ]
  assert.equal(matchesKeyword('前方高能', ['高能']), true)
  assert.equal(matchesKeyword('前方高能', ['  ']), false)
  const out = applyKeywordPreview(items, {
    highlightKeywords: ['高能'],
    blockKeywords: ['广告'],
  })
  assert.deepEqual(
    out.map((e) => ({ id: e.id, highlight: e.highlight })),
    [
      { id: 'a', highlight: true },
      { id: 'c', highlight: undefined },
    ],
  )
  assert.equal(items[1]?.highlight, true)
})
