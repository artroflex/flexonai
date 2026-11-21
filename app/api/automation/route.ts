import crypto from 'node:crypto'
import { checkProgramAccessApi } from '@/utils/access'
import { privateJson } from '@/utils/privateResponse'
import { generateJob } from '@/lib/automation/engine'
import { getSettings, getJob, listJobs, saveJob, saveSettings, withUserLock } from '@/lib/automation/store'
import { parseSettings, publishingBlockers } from '@/lib/automation/rules'
import { bodyLengthAccepted } from '@/lib/automation/article'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET() {
  const access = await checkProgramAccessApi()
  if (!access.allowed) return privateJson({ error: access.error }, { status: access.status })
  try {
    const [settings, jobs, keys] = await Promise.all([getSettings(access.user.id), listJobs(access.user.id), createAdminClient().from('user_api_keys').select('provider').eq('user_id', access.user.id)])
    if (keys.error) throw new Error('API 키 등록 상태를 확인하지 못했습니다.')
    const { tokenHash, ...safe } = settings
    return privateJson({ settings: { ...safe, connected: !!tokenHash }, jobs, configuredProviders: keys.data.map(key => key.provider) })
  } catch { return privateJson({ error: '자동화 저장소를 준비하지 못했습니다. 운영 설정을 확인해 주세요.' }, { status: 503 }) }
}
export async function POST(request: Request) {
  const access = await checkProgramAccessApi()
  if (!access.allowed) return privateJson({ error: access.error }, { status: access.status })
  const origin = request.headers.get('origin')
  const expectedHost = request.headers.get('host') || new URL(request.url).host
  if (origin && (() => { try { const url = new URL(origin); return url.host !== expectedHost || !['http:', 'https:'].includes(url.protocol) } catch { return true } })()) return privateJson({ error: '잘못된 요청 출처입니다.' }, { status: 403 })
  const userId = access.user.id
  try {
    const body = await request.json()
    if (body.action === 'generate') return privateJson({ job: await generateJob(userId) })
    return await withUserLock(userId, async () => {
      const current = await getSettings(userId)
      if (body.action === 'start') {
        const { data: keys, error } = await createAdminClient().from('user_api_keys').select('provider').eq('user_id', userId).in('provider', [current.provider, 'openai'])
        if (error) throw new Error('API 키 등록 상태를 확인하지 못했습니다.')
        const blockers = publishingBlockers(current, !!keys?.some(key => key.provider === current.provider), Date.now(), !!keys?.some(key => key.provider === 'openai'))
        if (blockers.length) throw new Error(blockers.join(' '))
        if ((await listJobs(userId)).some(job => job.status === 'needs_review')) throw new Error('확인이 필요한 작업의 네이버 발행 여부를 먼저 확인해 주세요.')
        await saveSettings(userId, parseSettings({ ...current, enabled: true, mode: 'publish' }, current))
        return privateJson({ ok: true })
      }
      if (body.action === 'pause') {
        await saveSettings(userId, { ...current, enabled: false, mode: 'draft' })
        return privateJson({ ok: true })
      }
      if (body.action === 'save') {
        await saveSettings(userId, parseSettings(body.settings, current))
        return privateJson({ ok: true })
      }
      if (body.action === 'token') {
        parseSettings(current, current)
        const token = `artro.${userId}.${crypto.randomBytes(32).toString('hex')}`
        await saveSettings(userId, { ...current, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), workerLastSeenAt: null })
        return privateJson({ token })
      }
      if (body.action === 'revoke') { await saveSettings(userId, { ...current, tokenHash: null }); return privateJson({ ok: true }) }
      if (body.action === 'verify') {
        const job = await getJob(userId, String(body.id))
        if (!job || job.status !== 'draft_saved' || job.blogId !== current.blogId || job.category !== current.category || !job.draftProof || body.confirmed !== true) throw new Error('현재 블로그·카테고리의 임시저장 글을 네이버에서 확인한 후 체크해 주세요.')
        const imageCount = current.imageCount ?? 5
        if (!bodyLengthAccepted(job.bodyCharCount ?? 0) || job.imageUrls?.length !== imageCount) throw new Error('이 글은 이전 작성 기준입니다. 본문 1,500~2,000자와 현재 이미지 수로 새 연결 시험 글을 만들어 확인해 주세요.')
        if (job.imageRights?.length !== imageCount) throw new Error('이용 조건을 확인한 실제 사진으로 새 연결 시험 글을 만들어 주세요.')
        await saveSettings(userId, { ...current, verifiedDraftAt: new Date().toISOString(), verifiedImageCount: imageCount, verifiedContentVersion: 2 })
        return privateJson({ ok: true })
      }
      if (body.action === 'cancel') {
        const job = await getJob(userId, String(body.id))
        if (!job || !['queued', 'needs_review', 'generating'].includes(job.status)) throw new Error('이 작업은 취소할 수 없습니다.')
        if (job.status === 'generating' && Date.now() - Date.parse(job.updatedAt) < 10 * 60000) throw new Error('아직 글을 생성 중입니다.')
        job.status = 'failed'; job.error = '사용자가 작업을 종료했습니다. 네이버에 입력된 내용은 삭제하지 않습니다.'
        await saveJob(userId, job); return privateJson({ ok: true })
      }
      throw new Error('지원하지 않는 작업입니다.')
    })
  } catch (error) { return privateJson({ error: error instanceof Error ? error.message : '자동화 요청 실패' }, { status: 400 }) }
}
