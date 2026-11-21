export type DeliveryMode = 'draft' | 'publish'
export type JobStatus = 'generating' | 'queued' | 'working' | 'draft_saved' | 'published' | 'failed' | 'needs_review' | 'skipped'
export interface AutomationSettings {
  enabled: boolean
  blogId: string
  category: string
  topic: string
  provider: 'gemini' | 'openai' | 'anthropic'
  mode: DeliveryMode
  verifiedDraftAt: string | null
  tokenHash: string | null
  workerLastSeenAt: string | null
}
export interface AutomationJob {
  id: string
  createdAt: string
  updatedAt: string
  status: JobStatus
  mode: DeliveryMode
  blogId: string
  category: string
  title: string
  contentHtml: string
  imageUrl: string | null
  sourceLinks: string[]
  fingerprint: string
  runId: string | null
  leaseUntil: string | null
  draftProof: string | null
  publishedUrl: string | null
  error: string | null
}
export const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: false, blogId: 'srluxury17', category: '연예뉴스',
  topic: '연예 (컴백 OR 신곡 OR 공연) (공식 OR 발표)', provider: 'openai', mode: 'draft',
  verifiedDraftAt: null, tokenHash: null, workerLastSeenAt: null,
}
export function parseSettings(input: unknown, previous: AutomationSettings): AutomationSettings {
  if (!input || typeof input !== 'object') throw new Error('설정을 확인해 주세요.')
  const v = input as Record<string, unknown>
  if (typeof v.enabled !== 'boolean' || !['draft', 'publish'].includes(String(v.mode))) throw new Error('자동화 설정이 올바르지 않습니다.')
  const blogId = String(v.blogId ?? '').trim()
  const category = String(v.category ?? '').trim()
  const topic = String(v.topic ?? '').trim()
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(blogId) || !category || category.length > 80 || !topic || topic.length > 160) throw new Error('블로그 ID·카테고리·수집 주제를 확인해 주세요.')
  if (!['gemini', 'openai', 'anthropic'].includes(String(v.provider))) throw new Error('지원하지 않는 AI입니다.')
  const targetChanged = blogId !== previous.blogId || category !== previous.category
  const verifiedDraftAt = targetChanged ? null : previous.verifiedDraftAt
  if (v.mode === 'publish' && !verifiedDraftAt) throw new Error('이 블로그·카테고리에서 임시저장을 확인한 뒤 자동 발행을 켤 수 있습니다.')
  return { ...previous, enabled: v.enabled, blogId, category, topic, provider: v.provider as AutomationSettings['provider'], mode: v.mode as DeliveryMode, verifiedDraftAt }
}
export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10)
}
export const DAILY_SLOTS = [9, 13, 18] as const
export function scheduledRunId(slot: number, now = new Date()): string {
  if (!(DAILY_SLOTS as readonly number[]).includes(slot)) throw new Error('지원하지 않는 예약 시간입니다.')
  return `daily-${kstDate(now)}-${String(slot).padStart(2, '0')}`
}
export function blocksGeneration(status: JobStatus, scheduled: boolean): boolean {
  return ['generating', 'working', 'needs_review'].includes(status) || (!scheduled && status === 'queued')
}
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
export function isPublicLink(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname) } catch { return false }
}
export function isPublishedUrl(value: string, blogId: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && ['blog.naver.com', 'm.blog.naver.com'].includes(u.hostname) &&
      (new RegExp(`^/${blogId}/\\d+$`).test(u.pathname) || (u.pathname === '/PostView.naver' && u.searchParams.get('blogId') === blogId && /^\d+$/.test(u.searchParams.get('logNo') || '')))
  } catch { return false }
}
export function validateResult(job: AutomationJob, input: Record<string, unknown>) {
  if (job.status !== 'working' || input.runId !== job.runId) throw new Error('이미 종료되었거나 다른 실행의 결과입니다.')
  const status = String(input.status)
  if (!['draft_saved', 'published', 'failed', 'needs_review'].includes(status)) throw new Error('결과 상태가 올바르지 않습니다.')
  if (status === 'published' && (job.mode !== 'publish' || !isPublishedUrl(String(input.publishedUrl || ''), job.blogId))) throw new Error('발행 모드와 실제 게시글 주소를 확인해 주세요.')
  if (status === 'draft_saved' && (typeof input.draftProof !== 'string' || input.draftProof.trim().length < 5)) throw new Error('임시저장 확인 정보가 필요합니다.')
  return status as JobStatus
}
