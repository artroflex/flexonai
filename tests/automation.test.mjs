import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_SETTINGS, parseSettings, kstDate, escapeHtml, isPublicLink, isPublishedUrl, validateResult, scheduledRunId, DAILY_SLOTS, blocksGeneration, sectionSourceIds, pcRecentlySeen, publishingBlockers } from '../lib/automation/rules.ts'
test('KST daily slot crosses UTC date boundary correctly', () => {
  assert.equal(kstDate(new Date('2026-11-20T15:00:00Z')), '2026-11-21')
  assert.equal(kstDate(new Date('2026-11-20T14:59:59Z')), '2026-11-20')
})
test('three distinct daily slots deduplicate independently and reset on the next Korean date', () => {
  const date = new Date('2026-11-20T15:00:00Z')
  const ids = DAILY_SLOTS.map(slot => scheduledRunId(slot, date))
  assert.deepEqual(ids, ['daily-2026-11-21-09', 'daily-2026-11-21-13', 'daily-2026-11-21-18'])
  assert.equal(new Set(ids).size, 3)
  assert.equal(scheduledRunId(13, date), ids[1])
  assert.equal(scheduledRunId(9, new Date('2026-11-21T15:00:00Z')), 'daily-2026-11-22-09')
  assert.throws(() => scheduledRunId(12, date))
})
test('deployed UTC cron schedules map to 09, 13 and 18 KST on separate daily routes', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const jobs = config.crons.filter(job => job.path.startsWith('/api/cron/automation'))
  assert.equal(jobs.length, 3)
  assert.equal(new Set(jobs.map(job => job.path)).size, 3)
  assert.deepEqual(jobs.map(job => (Number(job.schedule.split(' ')[1]) + 9) % 24), DAILY_SLOTS)
  for (const job of jobs) assert.match(job.schedule, /^0 \d+ \* \* \*$/)
})
test('offline PC may accumulate scheduled drafts, but uncertain results stop further generation', () => {
  assert.equal(blocksGeneration('queued', true), false)
  assert.equal(blocksGeneration('queued', false), true)
  for (const status of ['needs_review', 'working', 'generating']) assert.equal(blocksGeneration(status, true), true)
  assert.equal(blocksGeneration('draft_saved', true), false)
})
test('cannot enable publishing without a verified draft; changing target revokes verification', () => {
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, mode: 'publish' }, DEFAULT_SETTINGS))
  const verified = { ...DEFAULT_SETTINGS, blogId: 'srluxury17', verifiedDraftAt: new Date().toISOString() }
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

test('GEO paragraph citations cannot invent or use unselected article references', () => {
  assert.deepEqual(sectionSourceIds([2, 2, 5], [2, 5]), [2, 5])
  for (const value of [undefined, [], [1], ['2'], [2, 99], [2.5]]) {
    assert.throws(() => sectionSourceIds(value, [2, 5]))
  }
})

test('automatic publishing needs an own target, key, recent PC connection and verified draft', () => {
  const now = Date.parse('2026-11-21T10:00:00Z')
  const ready = { ...DEFAULT_SETTINGS, blogId: 'my_own_blog', tokenHash: 'fixture', workerLastSeenAt: new Date(now).toISOString(), verifiedDraftAt: new Date(now).toISOString() }
  assert.deepEqual(publishingBlockers(ready, true, now), [])
  assert.equal(publishingBlockers(ready, false, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, tokenHash: null }, true, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, verifiedDraftAt: null }, true, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, blogId: '' }, true, now).length, 1)
  assert.equal(pcRecentlySeen(new Date(now - 180001).toISOString(), now), false)
  assert.equal(pcRecentlySeen(new Date(now + 60000).toISOString(), now), false)
  assert.equal(pcRecentlySeen('invalid', now), false)
  assert.equal(pcRecentlySeen(new Date(now - 60000).toISOString(), now), true)
  assert.equal(DEFAULT_SETTINGS.blogId, '')
})
