import 'server-only'
import crypto from 'node:crypto'
import { collect24HourNews } from '@/utils/news/collector'
import { generateContentJson } from '@/utils/ai/contentJson'
import { resolveContentModel } from '@/utils/ai/contentModels'
import { resolveApiKey } from '@/utils/apiKeys'
import { createAdminClient } from '@/utils/supabase/admin'
import { escapeHtml, isPublicLink, kstDate, scheduledRunId, blocksGeneration, type AutomationJob, type AutomationSettings } from './rules'
import { bodyLengthAccepted, parseNewsDraft, resolveNewsImageCount, imageSectionIndices, NEWS_EDITORIAL_PROMPT, NEWS_GROUNDING_PROMPT, type NewsDraft } from './article'
import { generateNewsImages } from './images'
import { getSettings, listJobs, saveJob, withUserLock, writeObject } from './store'

async function buildPost(userId: string, settings: AutomationSettings, job: AutomationJob, history: AutomationJob[]) {
  const db = createAdminClient()
  const key = await resolveApiKey(db, userId, settings.provider)
  if (!key) throw new Error('설정에서 선택한 AI의 API 키를 먼저 등록해 주세요.')
  const imageKey = settings.provider === 'openai' ? key : await resolveApiKey(db, userId, 'openai')
  if (!imageKey) throw new Error('뉴스 이미지 생성용 OpenAI API 키를 등록해 주세요.')
  const imageCount = resolveNewsImageCount(settings.imageCount)
  const news = await collect24HourNews(settings.topic + ' when:1d')
  const articles = news.articles.filter(a => isPublicLink(a.link) && Number.isFinite(Date.parse(a.pubDate)) && Date.now() - Date.parse(a.pubDate) >= -300000 && Date.now() - Date.parse(a.pubDate) <= 86400000)
  const deliveredHistory = history.filter(j => ['queued', 'working', 'draft_saved', 'published', 'needs_review'].includes(j.status))
  const used = new Set(deliveredHistory.flatMap(j => j.sourceLinks))
  const fresh = articles.filter(a => !used.has(a.link))
  if (fresh.length < 2) { job.status = 'skipped'; job.error = '최근 24시간의 새로운 출처가 2개 미만이라 글을 만들지 않았습니다.'; return }
  const context = fresh.slice(0, 12).map((a, i) => ({ id: i, title: a.title, snippet: a.snippet, source: a.source, date: a.pubDate }))
  const textSignal = AbortSignal.timeout(100000)
  const generate = (revision?: unknown) => generateContentJson({
    provider: settings.provider, apiKey: key, model: resolveContentModel(settings.provider, undefined), system: NEWS_EDITORIAL_PROMPT,
    user: JSON.stringify({ date: new Date().toISOString(), category: settings.category, articles: context, ...(revision ? { revision } : {}) }),
    signal: textSignal,
  })
  const audit = (draft: NewsDraft) => generateContentJson({
    provider: settings.provider, apiKey: key, model: resolveContentModel(settings.provider, undefined), system: NEWS_GROUNDING_PROMPT,
    user: JSON.stringify({ articles: context, draft }), signal: textSignal,
  })
  let result = await generate()
  if (result.insufficient !== false) { job.status = 'skipped'; job.error = '1,500자 이상을 사실대로 작성할 근거가 부족해 건너뛰었습니다.'; return }
  let draft = parseNewsDraft(result, context.length)
  let assessment = await audit(draft)
  if (!bodyLengthAccepted(draft.bodyChars) || assessment.supported !== true) {
    result = await generate({ instruction: '아래 초안의 분량과 근거 검수 결과를 반영해 수정하세요. unsupportedIssues에 지적된 표현은 실제 근거가 없으면 삭제하세요. 확인된 사실과 출처는 유지하고 공백 포함 1500~2000자로 다듬으세요. 자료가 부족하면 insufficient=true를 반환하세요. 반복·추측으로 분량을 채우지 마세요.', unsupportedIssues: assessment.issues, actualBodyChars: draft.bodyChars, sectionBodyChars: draft.sections.map(section => Array.from(section.paragraphs.join(' ')).length), target: { intro: '130~180자', eachSection: '340~420자', total: '1500~2000자' }, draft })
    if (result.insufficient !== false) { job.status = 'skipped'; job.error = '충분한 근거 없이 분량을 늘리지 않도록 생성을 건너뛰었습니다.'; return }
    draft = parseNewsDraft(result, context.length)
    assessment = await audit(draft)
  }
  if (!bodyLengthAccepted(draft.bodyChars)) { job.status = 'skipped'; job.error = `본문 ${draft.bodyChars}자로 1,500~2,000자 기준을 충족하지 않아 발행하지 않았습니다.`; return }
  if (assessment.supported !== true) { job.status = 'skipped'; job.error = '분량을 늘리는 과정에서 출처로 확인되지 않는 설명이 남아 발행하지 않았습니다.'; return }
  const { title, intro, sourceIds: ids } = draft
  const sources = ids.map(i => fresh[i])
  if (new Set(sources.map(a => a.source)).size < 2) throw new Error('서로 다른 매체의 출처가 2개 이상 필요합니다.')
  const fingerprint = crypto.createHash('sha256').update(title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).digest('hex')
  if (deliveredHistory.some(j => j.fingerprint === fingerprint)) { job.status = 'skipped'; job.error = '이미 생성한 주제입니다.'; return }
  job.title = title; job.fingerprint = fingerprint; job.sourceLinks = sources.map(a => a.link)
  const images = await generateNewsImages(userId, job.id, imageKey, draft, imageCount)
  if (images.length !== imageCount) throw new Error('설정한 이미지 수를 충족하지 못했습니다.')
  job.imageUrl = images[0]; job.imageUrls = images; job.bodyCharCount = draft.bodyChars
  const figure = (url: string, caption: string) => `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(caption)} · AI 제작 참고 일러스트"/><figcaption>${escapeHtml(caption)} · AI 제작 일러스트, 실제 인물·현장 사진이 아닙니다.</figcaption></figure>`
  const placement = new Map(imageSectionIndices(imageCount).map((sectionIndex, i) => [sectionIndex, images[i + 1]]))
  const sections = draft.sections.map((section, index) => {
    const references = section.sourceIds.map(i => `<a href="${escapeHtml(fresh[i].link)}">${escapeHtml(fresh[i].source)}</a>`).join(' · ')
    return `<h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}<p><small>근거: ${references}</small></p>${placement.has(index) ? figure(placement.get(index)!, section.heading) : ''}`
  }).join('')
  const tags = draft.tags.map(t => '#' + t.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(t => t.length > 1)
  job.contentHtml = `<h2>핵심 요약</h2><p>${escapeHtml(intro)}</p><p><small>정리 기준: <time datetime="${new Date().toISOString()}">${kstDate()} (한국 시간)</time> · artroBLOG AI 초안</small></p>${figure(images[0], title)}${sections}<h2>관련 소식 출처</h2>${sources.map(a => `<p><a href="${escapeHtml(a.link)}">${escapeHtml(a.source)} · ${escapeHtml(a.title)}</a> (${escapeHtml(a.pubDate)})</p>`).join('')}<p>공개된 기사 제목·요약을 AI로 정리했습니다. 자세한 맥락은 원문에서 확인해 주세요.</p><p>${escapeHtml(tags.join(' '))}</p>`
  // Keep the existing post editor and archive useful for automated articles, too.
  const { data: post, error } = await db.from('blog_posts').insert({ user_id: userId, title, content: job.contentHtml, excerpt: intro.slice(0, 160), reading_minutes: Math.max(3, Math.ceil(draft.bodyChars / 500)) }).select('id').single()
  if (error || !post) throw new Error('생성한 글을 게시글 관리에 저장하지 못했습니다.')
  const { data: category } = await db.from('blog_categories').select('id').eq('user_id', userId).eq('name', settings.category).maybeSingle()
  let categoryId = category?.id
  if (!categoryId) {
    const { data: created, error: catError } = await db.from('blog_categories').insert({ user_id: userId, name: settings.category, slug: `news-${userId.slice(0, 8)}`, sort_order: 100 }).select('id').single()
    if (catError) throw new Error('글은 저장했지만 카테고리를 연결하지 못했습니다. 게시글 관리에서 확인해 주세요.')
    categoryId = created?.id
  }
  if (categoryId) { const { error: mapError } = await db.from('blog_post_categories').insert({ post_id: post.id, category_id: categoryId }); if (mapError) throw new Error('게시글 카테고리 연결에 실패했습니다.') }
  job.status = 'queued'
}
export async function generateJob(userId: string, scheduled = false, slot = 9) {
  return withUserLock(userId, async () => {
    const settings = await getSettings(userId)
    if (scheduled && !settings.enabled) return null
    if (!settings.blogId) throw new Error('먼저 발행할 내 네이버 블로그 ID를 저장해 주세요.')
    const history = await listJobs(userId)
    if (history.some(j => blocksGeneration(j.status, scheduled))) throw new Error('진행 중이거나 확인이 필요한 작업이 있습니다. 먼저 결과를 확인해 주세요.')
    // One run per KST date AND slot. Failed runs also retain their marker.
    const id = scheduled ? scheduledRunId(slot) : `test-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
    await writeObject(`${userId}/runs/${id}.json`, { createdAt: new Date().toISOString() }, true)
    const now = new Date().toISOString()
    const job: AutomationJob = { id, createdAt: now, updatedAt: now, status: 'generating', mode: scheduled ? settings.mode : 'draft', blogId: settings.blogId, category: settings.category, title: '', contentHtml: '', imageUrl: null, sourceLinks: [], fingerprint: '', runId: null, leaseUntil: null, draftProof: null, publishedUrl: null, error: null }
    await saveJob(userId, job)
    try { await buildPost(userId, settings, job, history) } catch (error) { job.status = 'failed'; job.error = error instanceof Error ? error.message : '글 생성 실패'; }
    await saveJob(userId, job)
    return job
  })
}
