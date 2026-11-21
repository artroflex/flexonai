import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_SETTINGS, parseSettings, queuedDeliveryMode, resolvePublishHours, scheduleLabel, SUBJECT_PRESETS, kstDate, escapeHtml, isPublicLink, isPublishedUrl, validateResult, scheduledRunId, DAILY_SLOTS, blocksGeneration, sectionSourceIds, pcRecentlySeen, publishingBlockers } from '../lib/automation/rules.ts'
test('KST daily slot crosses UTC date boundary correctly', () => {
  assert.equal(kstDate(new Date('2026-11-20T15:00:00Z')), '2026-11-21')
  assert.equal(kstDate(new Date('2026-11-20T14:59:59Z')), '2026-11-20')
})
test('three distinct daily slots deduplicate independently and reset on the next Korean date', () => {
  const date = new Date('2026-11-20T15:00:00Z')
  const ids = DAILY_SLOTS.map(slot => scheduledRunId(slot, date))
  assert.deepEqual(ids, ['daily-2026-11-21-07', 'daily-2026-11-21-09', 'daily-2026-11-21-19'])
  assert.equal(new Set(ids).size, 3)
  assert.equal(scheduledRunId(9, date), ids[1])
  assert.equal(scheduledRunId(9, new Date('2026-11-21T15:00:00Z')), 'daily-2026-11-22-09')
  for (const invalid of [-1, 24, 1.5, '7']) assert.throws(() => scheduledRunId(invalid, date))
})
test('daily UTC cron routes cover every selectable Korean hour exactly once', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  const jobs = config.crons.filter(job => job.path.startsWith('/api/cron/automation'))
  assert.equal(jobs.length, 24)
  assert.equal(new Set(jobs.map(job => job.path)).size, 24)
  assert.deepEqual(jobs.map(job => (Number(job.schedule.split(' ')[1]) + 9) % 24), Array.from({ length: 24 }, (_, h) => h))
  for (const job of jobs) {
    assert.match(job.schedule, /^0 \d+ \* \* \*$/)
    const slot = job.path === '/api/cron/automation' ? 9 : Number(job.path.split('/').at(-1))
    assert.equal((Number(job.schedule.split(' ')[1]) + 9) % 24, slot)
  }
})

test('each account saves its own topic, tone and schedule with safe legacy defaults', () => {
  const previous = { ...DEFAULT_SETTINGS, blogId: 'my_blog' }
  const saved = parseSettings({ ...previous, subject: 'sports', tone: 'friendly', publishHours: [22, 0] }, previous)
  assert.equal(saved.subject, 'sports')
  assert.equal(saved.tone, 'friendly')
  assert.deepEqual(saved.publishHours, [0, 22])
  assert.deepEqual(previous.publishHours, [7, 9, 19])
  assert.equal(SUBJECT_PRESETS[0].id, 'entertainment')
  assert.deepEqual(resolvePublishHours(undefined), [7, 9, 19])
  assert.equal(scheduleLabel([19, 7]), '07시 · 19시')
  for (const publishHours of [[], [7, 7], [24], [-1], ['9'], [1, 2, 3, 4]]) assert.throws(() => parseSettings({ ...previous, publishHours }, previous))
  for (const settings of [{ subject: 'bad' }, { tone: 'bad' }]) assert.throws(() => parseSettings({ ...previous, ...settings }, previous))
})
test('offline PC may accumulate scheduled drafts, but uncertain results stop further generation', () => {
  assert.equal(blocksGeneration('queued', true), false)
  assert.equal(blocksGeneration('queued', false), true)
  for (const status of ['needs_review', 'working', 'generating']) assert.equal(blocksGeneration(status, true), true)
  assert.equal(blocksGeneration('draft_saved', true), false)
})
test('cannot enable publishing without a verified draft; changing target revokes verification', () => {
  assert.throws(() => parseSettings({ ...DEFAULT_SETTINGS, enabled: true, mode: 'publish' }, DEFAULT_SETTINGS))
  const unverified = { ...DEFAULT_SETTINGS, blogId: 'my_blog' }
  assert.equal(parseSettings({ ...unverified, mode: 'publish' }, unverified).mode, 'publish')
  const verified = { ...DEFAULT_SETTINGS, blogId: 'srluxury17', verifiedDraftAt: new Date().toISOString() }
  assert.equal(parseSettings({ ...verified, mode: 'publish' }, verified).mode, 'publish')
  assert.throws(() => parseSettings({ ...verified, enabled: true, blogId: 'otherblog', mode: 'publish' }, verified))
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
  const ready = { ...DEFAULT_SETTINGS, mode: 'publish', blogId: 'my_own_blog', tokenHash: 'fixture', verifiedImageCount: 5, verifiedContentVersion: 2, workerLastSeenAt: new Date(now).toISOString(), verifiedDraftAt: new Date(now).toISOString() }
  assert.deepEqual(publishingBlockers(ready, true, now), [])
  assert.equal(publishingBlockers(ready, false, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, tokenHash: null }, true, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, verifiedDraftAt: null }, true, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, blogId: '' }, true, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, verifiedContentVersion: undefined }, true, now).length, 1)
  assert.equal(publishingBlockers({ ...ready, imageCount: 4 }, true, now).length, 1)
  assert.equal(pcRecentlySeen(new Date(now - 180001).toISOString(), now), false)
  assert.equal(pcRecentlySeen(new Date(now + 60000).toISOString(), now), false)
  assert.equal(pcRecentlySeen('invalid', now), false)
  assert.equal(pcRecentlySeen(new Date(now - 60000).toISOString(), now), true)
  assert.equal(DEFAULT_SETTINGS.blogId, '')
})

test('scheduled draft mode needs no previous draft proof and queued drafts never become public', () => {
  const settings = { ...DEFAULT_SETTINGS, enabled: true, blogId: 'my_blog', tokenHash: 'fixture', workerLastSeenAt: new Date().toISOString() }
  assert.deepEqual(publishingBlockers(settings, true), [])
  assert.equal(parseSettings(settings, settings).mode, 'draft')
  const job = { mode: 'publish', blogId: settings.blogId, category: settings.category, imageUrls: Array(5).fill('https://example.com/1.jpg') }
  assert.equal(queuedDeliveryMode(job, settings), 'draft')
  const verified = { ...settings, mode: 'publish', verifiedDraftAt: new Date().toISOString(), verifiedContentVersion: 2, verifiedImageCount: 5 }
  assert.equal(queuedDeliveryMode(job, verified), 'publish')
  assert.equal(queuedDeliveryMode({ ...job, mode: 'draft' }, verified), 'draft')
  assert.equal(queuedDeliveryMode(job, { ...verified, enabled: false }), 'draft')
  assert.equal(queuedDeliveryMode(job, { ...verified, verifiedDraftAt: null }), 'draft')
})
