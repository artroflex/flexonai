import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, parseSettings, kstDate, escapeHtml, isPublicLink, isPublishedUrl, validateResult } from '../lib/automation/rules.ts'
test('KST daily slot crosses UTC date boundary correctly', () => {
  assert.equal(kstDate(new Date('2026-11-20T15:00:00Z')), '2026-11-21')
  assert.equal(kstDate(new Date('2026-11-20T14:59:59Z')), '2026-11-20')
})
test('cannot enable publishing without a verified draft; changing target revokes verification', () => {
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, mode: 'publish' }, DEFAULT_SETTINGS))
  const verified = { ...DEFAULT_SETTINGS, verifiedDraftAt: new Date().toISOString() }
  assert.equal(parseSettings({ ...verified, mode: 'publish' }, verified).mode, 'publish')
  assert.throws(() => parseSettings({ ...verified, blogId: 'otherblog', mode: 'publish' }, verified))
  assert.equal(parseSettings({ ...verified, category: '다른 카테고리' }, verified).verifiedDraftAt, null)
})
test('untrusted model output is escaped and non-public source links are rejected', () => {
  assert.equal(escapeHtml('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;')
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://127.0.0.1/a', 'https://user:password@example.com']) assert.equal(isPublicLink(value), false)
  assert.equal(isPublicLink('https://www.yna.co.kr/view/test'), true)
})
test('published results require publish mode, own blog URL, matching run, and working state', () => {
  const job = { status: 'working', mode: 'draft', runId: 'correct', blogId: 'srluxury17' }
  assert.throws(() => validateResult(job, { runId: 'correct', status: 'published', publishedUrl: 'https://blog.naver.com/srluxury17/123' }))
  assert.throws(() => validateResult(job, { runId: 'stale', status: 'draft_saved', draftProof: '저장 완료 확인' }))
  assert.throws(() => validateResult(job, { runId: 'correct', status: 'draft_saved' }))
  assert.equal(validateResult(job, { runId: 'correct', status: 'draft_saved', draftProof: '임시저장 완료 확인' }), 'draft_saved')
  assert.equal(isPublishedUrl('https://evil.com/srluxury17/123', 'srluxury17'), false)
  assert.equal(isPublishedUrl('https://blog.naver.com/other/123', 'srluxury17'), false)
  assert.equal(isPublishedUrl('https://blog.naver.com/srluxury17/123', 'srluxury17'), true)
  assert.equal(validateResult({ ...job, mode: 'publish' }, { runId: 'correct', status: 'published', publishedUrl: 'https://blog.naver.com/srluxury17/123' }), 'published')
})
