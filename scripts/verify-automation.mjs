// Integration QA uses a disposable account and a private prefix, never an existing user's data.
import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from '@playwright/test'
for (const line of fs.readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
}
const origin = process.argv[2] || 'http://127.0.0.1:3100'
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) throw new Error('Integration QA must target a local app server')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const email = `artro-qa-${crypto.randomUUID()}@example.invalid`
const password = crypto.randomBytes(24).toString('base64url') + 'aA1!'
const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
if (error || !created.user) throw new Error('Could not create disposable QA account')
const id = created.user.id
const bucket = db.storage.from('artro-automation')
let jar = []
const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => jar, setAll: entries => { for (const entry of entries) { jar = jar.filter(c => c.name !== entry.name); jar.push(entry) } } } })
const { error: loginError } = await client.auth.signInWithPassword({ email, password })
let browser
async function request(path, body, extra = {}, auth = true) {
  const res = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { ...(auth ? { Cookie: jar.map(c => `${c.name}=${c.value}`).join('; ') } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' })
  const type = res.headers.get('content-type') || ''
  return { status: res.status, data: type.includes('json') ? await res.json() : await res.text() }
}
try {
  if (loginError) throw new Error('Could not authenticate QA account')
  assert.equal((await request('/api/automation', null, {}, false)).status, 401)
  assert.equal((await request('/api/cron/automation', null, {}, false)).status, 401)
  const initial = await request('/api/automation'); assert.equal(initial.status, 200); assert.equal(initial.data.jobs.length, 0)
  const settings = { ...initial.data.settings, blogId: 'artro_qa' }
  assert.deepEqual(initial.data.configuredProviders, [])
  assert.equal((await request('/api/automation', { action: 'start' })).status, 400)
  assert.equal((await request('/api/automation', { action: 'save', settings }, { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await request('/api/automation', { action: 'save', settings: { ...settings, mode: 'publish' } })).status, 400)
  assert.equal((await request('/api/automation', { action: 'save', settings })).status, 200)
  const issued = await request('/api/automation', { action: 'token' }); assert.equal(issued.status, 200)
  const auth = { Authorization: `Bearer ${issued.data.token}` }
  assert.equal((await request('/api/automation/worker', { action: 'ping' }, auth, false)).status, 200)
  assert.equal((await request('/api/automation/worker', { action: 'ping' }, { Authorization: `Bearer artro.${id}.${'a'.repeat(64)}` }, false)).status, 401)
  const now = new Date().toISOString()
  const job = { id: 'qa-draft', createdAt: now, updatedAt: now, status: 'queued', mode: 'publish', blogId: settings.blogId, category: settings.category, title: '임시저장 연결 시험', contentHtml: '<p>자동화 흐름을 확인하는 테스트 글입니다.</p>', imageUrl: null, bodyCharCount: 1750, imageUrls: Array.from({ length: 5 }, (_, i) => `https://example.invalid/fixture-${i}.png`), sourceLinks: [], fingerprint: '', runId: null, leaseUntil: null, draftProof: null, publishedUrl: null, error: null }
  const upload = await bucket.upload(`${id}/jobs/${job.id}.json`, JSON.stringify(job), { contentType: 'application/json' }); assert.equal(upload.error, null)
  const claims = await Promise.all([request('/api/automation/worker', { action: 'claim', blogId: settings.blogId, capabilities: ['interleaved-images-v1'] }, auth, false), request('/api/automation/worker', { action: 'claim', blogId: settings.blogId, capabilities: ['interleaved-images-v1'] }, auth, false)])
  const tasks = claims.filter(r => r.data.task).map(r => r.data.task); assert.equal(tasks.length, 1); assert.equal(tasks[0].mode, 'draft')
  const active = { id: job.id, runId: tasks[0].runId }
  assert.equal((await request('/api/automation/worker', { action: 'result', ...active, status: 'published', publishedUrl: `https://blog.naver.com/${settings.blogId}/123` }, auth, false)).status, 409)
  assert.equal((await request('/api/automation/worker', { action: 'result', ...active, runId: 'stale', status: 'draft_saved', draftProof: '테스트 저장 확인' }, auth, false)).status, 409)
  const result = { action: 'result', ...active, status: 'draft_saved', draftProof: 'QA fixture: 임시저장 완료 확인' }
  assert.equal((await request('/api/automation/worker', result, auth, false)).status, 200)
  assert.equal((await request('/api/automation/worker', result, auth, false)).status, 200)
  const multi = { ...job, id: 'qa-multi-images', status: 'queued', mode: 'draft', imageUrls: Array.from({ length: 5 }, (_, i) => `https://example.invalid/fixture-${i}.png`) }
  assert.equal((await bucket.upload(`${id}/jobs/${multi.id}.json`, JSON.stringify(multi), { contentType: 'application/json' })).error, null)
  const oldConnector = await request('/api/automation/worker', { action: 'claim', blogId: settings.blogId }, auth, false)
  assert.equal(oldConnector.status, 409)
  assert.match(oldConnector.data.error, /최신 크롬 연결 도구/)
  const newConnector = await request('/api/automation/worker', { action: 'claim', blogId: settings.blogId, capabilities: ['interleaved-images-v1'] }, auth, false)
  assert.equal(newConnector.data.task.id, multi.id)
  assert.equal((await request('/api/automation/worker', { action: 'result', id: multi.id, runId: newConnector.data.task.runId, status: 'failed', error: 'Fixture verification complete; no Naver connection' }, auth, false)).status, 200)
  assert.equal((await bucket.remove([`${id}/jobs/${multi.id}.json`])).error, null)
  assert.equal((await request('/api/automation', { action: 'verify', id: job.id, confirmed: true })).status, 200)
  const verified = (await request('/api/automation')).data.settings
  assert.equal((await request('/api/automation', { action: 'save', settings: { ...verified, mode: 'publish' } })).status, 200)
  assert.equal((await request('/api/automation', { action: 'save', settings: { ...verified, mode: 'publish', blogId: 'otherblog' } })).status, 400)
  assert.equal((await request('/api/automation', { action: 'save', settings: { ...verified, mode: 'draft' } })).status, 200)
  assert.equal((await request('/api/automation', { action: 'start' })).status, 400)
  const { error: fixtureKeyError } = await db.from('user_api_keys').insert({ user_id: id, provider: 'openai', api_key: 'qa-local-fixture-never-sent-to-provider' })
  assert.equal(fixtureKeyError, null)
  assert.equal((await request('/api/automation', { action: 'start' })).status, 200)
  const started = (await request('/api/automation')).data
  assert.equal(started.settings.enabled, true)
  assert.equal(started.settings.mode, 'publish')
  assert.deepEqual(started.configuredProviders, ['openai'])
  assert.equal(JSON.stringify(started).includes('qa-local-fixture'), false)
  const daily = { ...job, id: 'daily-qa-paused', status: 'queued' }
  assert.equal((await bucket.upload(`${id}/jobs/${daily.id}.json`, JSON.stringify(daily), { contentType: 'application/json' })).error, null)
  assert.equal((await request('/api/automation', { action: 'pause' })).status, 200)
  const paused = (await request('/api/automation')).data.settings
  assert.equal(paused.enabled, false)
  assert.equal(paused.mode, 'draft')
  assert.equal((await request('/api/automation/worker', { action: 'claim', blogId: settings.blogId, capabilities: ['interleaved-images-v1'] }, auth, false)).data.task, null)
  assert.equal((await bucket.remove([`${id}/jobs/${daily.id}.json`])).error, null)
  assert.equal((await db.from('user_api_keys').delete().eq('user_id', id).eq('provider', 'openai')).error, null)
  const generation = await request('/api/automation', { action: 'generate' })
  assert.equal(generation.status, 200); assert.equal(generation.data.job.status, 'failed'); assert.match(generation.data.job.error, /API 키/)
  const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  assert.ok((await anonymous.storage.from('artro-automation').download(`${id}/settings.json`)).error)
  const safe = await request('/api/automation'); assert.equal('tokenHash' in safe.data.settings, false)
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addCookies(jar.map(c => ({ name: c.name, value: c.value, url: origin })))
  const page = await context.newPage()
  await page.goto(origin + '/automation'); await page.getByRole('heading', { name: /뉴스를 발견하고,/ }).waitFor()
  await page.getByRole('heading', { name: '임시저장 연결 시험', exact: true }).waitFor()
  fs.mkdirSync('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/automation-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'artifacts/automation-mobile.png', fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await page.goto(origin + '/'); await page.getByRole('heading', { name: /뉴스를 발견하고,/ }).waitFor()
  assert.equal((await request('/api/automation', { action: 'revoke' })).status, 200)
  assert.equal((await request('/api/automation/worker', { action: 'ping' }, auth, false)).status, 401)
  console.log('Integration QA PASS (including publishing start, pause, no key leakage, and paused scheduled claim): auth, tenant scope, private storage, settings gate, token rotation/revocation, atomic claim, stale result rejection, idempotent result, missing key, desktop/mobile UI. Naver itself was not contacted.')
} finally {
  if (browser) await browser.close()
  for (const sub of ['', '/jobs', '/runs']) {
    const { data } = await bucket.list(id + sub, { limit: 100 })
    const paths = (data || []).filter(f => f.id).map(f => `${id}${sub}/${f.name}`)
    if (paths.length) { const { error } = await bucket.remove(paths); if (error) console.error('QA storage cleanup needs attention') }
  }
  const { error } = await db.auth.admin.deleteUser(id)
  if (error) console.error('QA account cleanup needs attention')
}
