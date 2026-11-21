export type DeliveryMode = 'draft' | 'publish'
export type JobStatus = 'generating' | 'queued' | 'working' | 'draft_saved' | 'published' | 'failed' | 'needs_review' | 'skipped'
export interface AutomationSettings {
  enabled: boolean
  blogId: string
  category: string
  topic: string
  subject?: string
  tone?: string
  publishHours?: number[]
  provider: 'gemini' | 'openai' | 'anthropic'
  mode: DeliveryMode
  imageCount?: 4 | 5
  verifiedDraftAt: string | null
  verifiedImageCount?: 4 | 5
  verifiedContentVersion?: 2
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
  imageUrls?: string[]
  bodyCharCount?: number
  sourceLinks: string[]
  fingerprint: string
  runId: string | null
  leaseUntil: string | null
  draftProof: string | null
  publishedUrl: string | null
  error: string | null
}
export const DEFAULT_NEWS_TOPIC = '연예 (예능 OR 드라마 OR 배우 OR 가수 OR 영화 OR 결혼 OR 캐스팅 OR 컴백)'
export const NEWS_TOPIC_PRESETS = [
  { label: '관심 연예 이슈 전체', topic: DEFAULT_NEWS_TOPIC },
  { label: '예능 · 연애 · 결혼', topic: '연예 (예능 OR "나는 SOLO" OR "계약결혼" OR 결혼 OR 방송)' },
  { label: '배우 · 드라마 · 영화', topic: '연예 (드라마 OR 영화 OR 배우 OR 캐스팅 OR 제작발표회)' },
  { label: '가수 · 음악 · 공연', topic: '연예 (가수 OR 신곡 OR 컴백 OR 공연 OR 콘서트)' },
] as const
export const SUBJECT_PRESETS = [
  { id: 'entertainment', label: '연예뉴스', query: DEFAULT_NEWS_TOPIC },
  { id: 'sports', label: '스포츠', query: '스포츠 (축구 OR 야구 OR 농구 OR 배구 OR 경기)' },
  { id: 'living', label: '리빙', query: '리빙 (인테리어 OR 살림 OR 정리 OR 주거 OR 생활)' },
  { id: 'travel', label: '여행', query: '여행 (관광 OR 여행지 OR 축제 OR 지역)' },
  { id: 'food', label: '맛집·푸드', query: '푸드 (음식 OR 식당 OR 요리 OR 식품)' },
  { id: 'tech', label: 'IT·테크', query: 'IT (기술 OR 스마트폰 OR 인공지능 OR 소프트웨어)' },
  { id: 'economy', label: '경제·생활정보', query: '경제 (생활경제 OR 소비 OR 물가 OR 정책)' },
  { id: 'culture', label: '문화·책', query: '문화 (전시 OR 도서 OR 공연 OR 미술)' },
] as const
export const TONE_PRESETS = [
  { id: 'natural', label: '자연스러운 존댓말', instruction: '친절한 존댓말로 ~예요, ~습니다를 자연스럽게 섞습니다.' },
  { id: 'friendly', label: '친근한 대화체', instruction: '독자에게 이야기하듯 부드러운 해요체로 씁니다. 과한 감탄과 경험담은 만들지 않습니다.' },
  { id: 'informative', label: '정보 전달형', instruction: '명료한 합니다체로 핵심 사실과 일정을 간결하게 전달합니다.' },
  { id: 'professional', label: '전문가형', instruction: '차분한 합니다체로 근거와 맥락을 설명하고 어려운 용어는 쉽게 풉니다. 전문 자격이나 경험을 사칭하지 않습니다.' },
] as const
export function resolvePublishHours(value: unknown): number[] {
  const hours = value === undefined ? [...DAILY_SLOTS] : value
  if (!Array.isArray(hours) || hours.length < 1 || hours.length > 3 || hours.some(h => !Number.isInteger(h) || h < 0 || h > 23) || new Set(hours).size !== hours.length) throw new Error('발행 시간은 0~23시 중 중복 없이 1~3개 선택해 주세요.')
  return [...hours].sort((a, b) => a - b)
}
export function scheduleLabel(hours?: number[]): string {
  return resolvePublishHours(hours).map(h => `${String(h).padStart(2, '0')}시`).join(' · ')
}
export const DEFAULT_SETTINGS: AutomationSettings = {
  enabled: false, blogId: '', category: '연예뉴스',
  topic: DEFAULT_NEWS_TOPIC, subject: 'entertainment', tone: 'natural', publishHours: [7, 9, 19], provider: 'openai', mode: 'draft', imageCount: 5,
  verifiedDraftAt: null, tokenHash: null, workerLastSeenAt: null,
}
export function parseSettings(input: unknown, previous: AutomationSettings): AutomationSettings {
  if (!input || typeof input !== 'object') throw new Error('설정을 확인해 주세요.')
  const v = input as Record<string, unknown>
  if (typeof v.enabled !== 'boolean' || !['draft', 'publish'].includes(String(v.mode))) throw new Error('자동화 설정이 올바르지 않습니다.')
  const blogId = String(v.blogId ?? '').trim()
  const category = String(v.category ?? '').trim()
  const topic = String(v.topic ?? '').trim()
  const subject = String(v.subject ?? previous.subject ?? 'entertainment')
  const tone = String(v.tone ?? previous.tone ?? 'natural')
  if (!SUBJECT_PRESETS.some(s => s.id === subject) || !TONE_PRESETS.some(t => t.id === tone)) throw new Error('주제와 말투를 다시 선택해 주세요.')
  const publishHours = resolvePublishHours(v.publishHours ?? previous.publishHours)
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(blogId) || !category || category.length > 80 || !topic || topic.length > 160) throw new Error('블로그 ID·카테고리·수집 주제를 확인해 주세요.')
  if (!['gemini', 'openai', 'anthropic'].includes(String(v.provider))) throw new Error('지원하지 않는 AI입니다.')
  const imageCount = v.imageCount ?? previous.imageCount ?? 5
  if (imageCount !== 4 && imageCount !== 5) throw new Error('뉴스 이미지는 4장 또는 5장을 선택해 주세요.')
  const targetChanged = blogId !== previous.blogId || category !== previous.category || imageCount !== (previous.imageCount ?? 5)
  const verifiedDraftAt = targetChanged ? null : previous.verifiedDraftAt
  if (v.mode === 'publish' && !verifiedDraftAt) throw new Error('이 블로그·카테고리에서 임시저장을 확인한 뒤 자동 발행을 켤 수 있습니다.')
  return { ...previous, enabled: v.enabled, blogId, category, topic, subject, tone, publishHours, provider: v.provider as AutomationSettings['provider'], mode: v.mode as DeliveryMode, imageCount, verifiedDraftAt, verifiedImageCount: targetChanged ? undefined : previous.verifiedImageCount, verifiedContentVersion: targetChanged ? undefined : previous.verifiedContentVersion }
}
export function kstDate(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10)
}
export const DAILY_SLOTS = [7, 9, 19] as const
export const DAILY_SCHEDULE_LABEL = DAILY_SLOTS.map(slot => `${String(slot).padStart(2, '0')}시`).join(' · ')
export function scheduledRunId(slot: number, now = new Date()): string {
  if (!Number.isInteger(slot) || slot < 0 || slot > 23) throw new Error('지원하지 않는 예약 시간입니다.')
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

/** Only link a section to articles explicitly selected for this generated post. */
export function sectionSourceIds(value: unknown, selectedIds: number[]): number[] {
  if (!Array.isArray(value) || !value.length || value.some(id => !Number.isInteger(id) || !selectedIds.includes(id))) {
    throw new Error('본문의 근거 출처를 확인하지 못했습니다.')
  }
  return [...new Set(value)] as number[]
}

export function pcRecentlySeen(lastSeen: string | null, now = Date.now()): boolean {
  const timestamp = Date.parse(lastSeen || '')
  return Number.isFinite(timestamp) && timestamp <= now + 30000 && now - timestamp <= 180000
}

export function publishingBlockers(settings: AutomationSettings, keyRegistered: boolean, now = Date.now(), imageKeyRegistered = settings.provider === 'openai' && keyRegistered): string[] {
  const blockers: string[] = []
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(settings.blogId) || !settings.category.trim()) blockers.push('내 네이버 블로그와 카테고리를 저장해 주세요.')
  if (!keyRegistered) blockers.push('선택한 AI의 API 키를 등록해 주세요.')
  if (settings.provider !== 'openai' && !imageKeyRegistered) blockers.push('이미지 생성용 OpenAI API 키도 등록해 주세요.')
  if (!settings.tokenHash || !pcRecentlySeen(settings.workerLastSeenAt, now)) blockers.push('PC 크롬 연결 도구를 켜고 연결을 확인해 주세요.')
  if (!settings.verifiedDraftAt || settings.verifiedContentVersion !== 2 || settings.verifiedImageCount !== (settings.imageCount ?? 5)) blockers.push('본문 1,500~2,000자와 현재 이미지 수로 만든 임시저장 글 1건을 확인해 주세요.')
  return blockers
}
