import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
import { DEFAULT_SETTINGS, type AutomationSettings, type AutomationJob } from './rules'

// Private Storage keeps automation state separate from 30-day content cleanup.
// No public bucket policy or client-side service key is used. A create-only object is the mutex.
export const AUTOMATION_BUCKET = 'artro-automation'
const storage = () => createAdminClient().storage.from(AUTOMATION_BUCKET)
function missing(error: { message?: string; statusCode?: string | number }) {
  return String(error.statusCode) === '404' || /not found|does not exist/i.test(error.message || '')
}
export async function readObject<T>(path: string): Promise<T | null> {
  const { data, error } = await storage().download(path)
  if (error) { if (missing(error)) return null; throw new Error('자동화 데이터를 읽지 못했습니다.') }
  return JSON.parse(await data.text()) as T
}
export async function writeObject(path: string, value: unknown, createOnly = false) {
  const { error } = await storage().upload(path, Buffer.from(JSON.stringify(value)), { contentType: 'application/json', upsert: !createOnly, cacheControl: '0' })
  if (error) throw new Error(createOnly ? '다른 작업이 진행 중이거나 이미 처리한 실행입니다.' : '자동화 데이터를 저장하지 못했습니다.')
}
export async function getSettings(userId: string) {
  return await readObject<AutomationSettings>(`${userId}/settings.json`) ?? { ...DEFAULT_SETTINGS }
}
export async function saveSettings(userId: string, settings: AutomationSettings) { await writeObject(`${userId}/settings.json`, settings) }
export async function getJob(userId: string, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('작업 번호가 올바르지 않습니다.')
  return readObject<AutomationJob>(`${userId}/jobs/${id}.json`)
}
export async function saveJob(userId: string, job: AutomationJob) {
  job.updatedAt = new Date().toISOString()
  await writeObject(`${userId}/jobs/${job.id}.json`, job)
}
export async function listJobs(userId: string) {
  const { data, error } = await storage().list(`${userId}/jobs`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw new Error('자동화 작업 목록을 읽지 못했습니다.')
  return (await Promise.all(data.filter(f => f.name.endsWith('.json')).map(f => readObject<AutomationJob>(`${userId}/jobs/${f.name}`)))).filter((v): v is AutomationJob => !!v)
}
export async function withUserLock<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const path = `${userId}/mutex.json`
  await writeObject(path, { createdAt: new Date().toISOString() }, true)
  try { return await action() } finally { const { error } = await storage().remove([path]); if (error) console.error('Automation lock release failed') }
}
export async function listOwners() {
  const { data, error } = await storage().list('', { limit: 1000 })
  if (error) throw new Error('자동화 계정을 조회하지 못했습니다.')
  return data.filter(f => /^[0-9a-f-]{36}$/.test(f.name)).map(f => f.name)
}
