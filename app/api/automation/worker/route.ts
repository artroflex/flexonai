import crypto from 'node:crypto'
import { getSettings, listJobs, saveJob, saveSettings, withUserLock, getJob } from '@/lib/automation/store'
import { validateResult } from '@/lib/automation/rules'
import { privateJson } from '@/utils/privateResponse'
import { createAdminClient } from '@/utils/supabase/admin'
import { IS_STANDALONE } from '@/lib/deployment'
import { checkProgramAccess } from '@/lib/access/checkProgramAccess'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
    const match = /^artro\.([0-9a-f-]{36})\.[0-9a-f]{64}$/.exec(token)
    if (!match) return privateJson({ error: '연결 코드가 올바르지 않습니다.' }, { status: 401 })
    const userId = match[1]
    const settings = await getSettings(userId)
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    if (!settings.tokenHash || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(settings.tokenHash))) return privateJson({ error: '연결 코드가 만료됐습니다.' }, { status: 401 })
    const db = createAdminClient()
    const { data: { user } } = await db.auth.admin.getUserById(userId)
    if (!user || (!IS_STANDALONE && !(await checkProgramAccess(db, userId, 'ai-auto-blog')).allowed)) return privateJson({ error: '이용 권한이 없습니다.' }, { status: 403 })
    const input = await request.json()
    return await withUserLock(userId, async () => {
      const current = await getSettings(userId)
      // Token may have been revoked while this request was waiting.
      if (current.tokenHash !== hash) return privateJson({ error: '연결 코드가 변경됐습니다.' }, { status: 401 })
      await saveSettings(userId, { ...current, workerLastSeenAt: new Date().toISOString() })
      if (input.action === 'ping') return privateJson({ ok: true, blogId: current.blogId, category: current.category })
      const jobs = await listJobs(userId)
      for (const job of jobs.filter(j => j.status === 'working' && Date.parse(j.leaseUntil || '') < Date.now())) {
        job.status = 'needs_review'; job.error = 'PC 연결이 끊겼습니다. 네이버 임시저장·발행 여부를 직접 확인해 주세요. 중복 방지를 위해 자동 재시도하지 않습니다.'
        await saveJob(userId, job)
      }
      if (input.action === 'claim') {
        if (input.blogId !== current.blogId) throw new Error('확장에 저장된 블로그 ID가 플랫폼 설정과 다릅니다.')
        if (jobs.some(j => ['working', 'needs_review'].includes(j.status))) return privateJson({ task: null })
        const job = jobs.filter(j => j.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
        if (!job) return privateJson({ task: null })
        if (job.contentHtml.includes('color:#C62828') && (!Array.isArray(input.capabilities) || !input.capabilities.includes('rich-text-v1'))) throw new Error('빨간 소제목·인용구 서식을 유지하려면 크롬 연결 도구 v1.2.0 이상으로 업데이트해 주세요.')
        if ((job.imageUrls?.length || 0) > 1 && (!Array.isArray(input.capabilities) || !input.capabilities.includes('interleaved-images-v1'))) throw new Error('이미지 여러 장을 전송하려면 최신 크롬 연결 도구 v1.1.0 이상으로 업데이트해 주세요.')
        // Pausing blocks pending scheduled work; manual draft connection tests remain available.
        if (!current.enabled && job.id.startsWith('daily-')) return privateJson({ task: null })
        if (job.blogId !== current.blogId || job.category !== current.category) { job.status = 'needs_review'; job.error = '대기 중에 발행 대상 설정이 바뀌었습니다.'; await saveJob(userId, job); return privateJson({ task: null }) }
        // Switching publishing off also downgrades already queued work.
        if (job.mode === 'publish' && (current.mode !== 'publish' || !current.verifiedDraftAt || current.verifiedContentVersion !== 2 || current.verifiedImageCount !== job.imageUrls?.length)) job.mode = 'draft'
        job.status = 'working'; job.runId = crypto.randomUUID(); job.leaseUntil = new Date(Date.now() + 5 * 60000).toISOString()
        await saveJob(userId, job)
        return privateJson({ task: job })
      }
      const job = await getJob(userId, String(input.id))
      if (!job || job.runId !== input.runId) throw new Error('실행 번호가 다릅니다.')
      if (input.action === 'heartbeat') {
        if (job.status !== 'working') throw new Error('종료된 작업입니다.')
        job.leaseUntil = new Date(Date.now() + 5 * 60000).toISOString(); await saveJob(userId, job); return privateJson({ ok: true })
      }
      if (input.action === 'result') {
        // Network retries of a confirmed terminal result are idempotent.
        if (job.status === input.status && ['draft_saved', 'published', 'failed', 'needs_review'].includes(job.status)) return privateJson({ ok: true })
        job.status = validateResult(job, input)
        job.draftProof = typeof input.draftProof === 'string' ? input.draftProof.slice(0, 300) : null
        job.publishedUrl = job.status === 'published' ? String(input.publishedUrl) : null
        job.error = typeof input.error === 'string' ? input.error.slice(0, 500) : null
        job.leaseUntil = null; await saveJob(userId, job); return privateJson({ ok: true })
      }
      throw new Error('지원하지 않는 작업입니다.')
    })
  } catch (error) { return privateJson({ error: error instanceof Error ? error.message : '작업 요청 실패' }, { status: 409 }) }
}
