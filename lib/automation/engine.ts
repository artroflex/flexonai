import 'server-only'
import crypto from 'node:crypto'
import { collect24HourNews } from '@/utils/news/collector'
import { generateContentJson } from '@/utils/ai/contentJson'
import { resolveContentModel } from '@/utils/ai/contentModels'
import { resolveApiKey } from '@/utils/apiKeys'
import { createAdminClient } from '@/utils/supabase/admin'
import { isPublicLink, scheduledRunId, resolvePublishHours, blocksGeneration, DEFAULT_NEWS_TOPIC, NEWS_TOPIC_PRESETS, SUBJECT_PRESETS, TONE_PRESETS, type AutomationJob, type AutomationSettings } from './rules'
import { renderNewsHtml } from './render'
import { mergeNewsPools } from './newsSelection'
import { bodyLengthAccepted, parseNewsDraft, resolveNewsImageCount, editorialPrompt, NEWS_GROUNDING_PROMPT, validateNewsQuotes, type NewsDraft } from './article'
import { collectNewsPhotos } from './images'
import { getSettings, listJobs, saveJob, withUserLock, writeObject } from './store'

async function buildPost(userId: string, settings: AutomationSettings, job: AutomationJob, history: AutomationJob[]) {
  const db = createAdminClient()
  const key = await resolveApiKey(db, userId, settings.provider)
  if (!key) throw new Error('설정에서 선택한 AI의 API 키를 먼저 등록해 주세요.')
  const imageCount = resolveNewsImageCount(settings.imageCount)
  const queries = settings.topic === DEFAULT_NEWS_TOPIC ? NEWS_TOPIC_PRESETS.slice(1).map(preset => preset.topic) : [settings.topic]
  const pools = await Promise.all(queries.map(async query => {
    try { return (await collect24HourNews(query + ' when:1d')).articles } catch { return [] }
  }))
  const articles = mergeNewsPools(pools).filter(a => isPublicLink(a.link) && Number.isFinite(Date.parse(a.pubDate)) && Date.now() - Date.parse(a.pubDate) >= -300000 && Date.now() - Date.parse(a.pubDate) <= 86400000)
  const deliveredHistory = history.filter(j => ['queued', 'working', 'draft_saved', 'published', 'needs_review'].includes(j.status))
  const used = new Set(deliveredHistory.flatMap(j => j.sourceLinks))
  const fresh = articles.filter(a => !used.has(a.link))
  if (fresh.length < 2) { job.status = 'skipped'; job.error = '최근 24시간의 새로운 출처가 2개 미만이라 글을 만들지 않았습니다.'; return }
  const context = fresh.slice(0, 30).map((a, i) => ({ id: i, title: a.title, snippet: a.snippet, source: a.source, date: a.pubDate }))
  const textSignal = AbortSignal.timeout(100000)
  const generate = (revision?: unknown) => generateContentJson({
    provider: settings.provider, apiKey: key, model: resolveContentModel(settings.provider, undefined), system: editorialPrompt(settings.subject ?? 'entertainment', TONE_PRESETS.find(t => t.id === settings.tone)?.instruction ?? TONE_PRESETS[0].instruction),
    user: JSON.stringify({ date: new Date().toISOString(), subject: SUBJECT_PRESETS.find(s => s.id === settings.subject)?.label ?? '연예뉴스', tone: settings.tone ?? 'natural', category: settings.category, articles: context, ...(revision ? { revision } : {}) }),
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
  validateNewsQuotes(draft, context)
  const sources = ids.map(i => fresh[i])
  if (new Set(sources.map(a => a.source)).size < 2) throw new Error('서로 다른 매체의 출처가 2개 이상 필요합니다.')
  const fingerprint = crypto.createHash('sha256').update(title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).digest('hex')
  if (deliveredHistory.some(j => j.fingerprint === fingerprint)) { job.status = 'skipped'; job.error = '이미 생성한 주제입니다.'; return }
  job.title = title; job.fingerprint = fingerprint; job.sourceLinks = sources.map(a => a.link)
  const evidence = context.filter(a => ids.includes(a.id)).map(a => `${a.title} ${a.snippet}`).join(' ').normalize('NFC')
  const photoQueries = draft.photoQueries.filter(query => evidence.includes(query))
  if (!photoQueries.length) { job.status = 'skipped'; job.error = '자료에서 확인되는 인물·장소의 사진 검색어가 없어 발행을 보류합니다.'; return }
  let photos
  try { photos = await collectNewsPhotos(userId, job.id, photoQueries, imageCount) }
  catch (error) { job.status = 'skipped'; job.error = error instanceof Error ? error.message : '허용된 실제 사진을 확보하지 못해 발행을 보류합니다.'; return }
  const images = photos.map(photo => photo.url)
  if (images.length !== imageCount) throw new Error('설정한 이미지 수를 충족하지 못했습니다.')
  job.imageUrl = images[0]; job.imageUrls = images; job.bodyCharCount = draft.bodyChars
  job.imageRights = photos
  job.contentHtml = renderNewsHtml(draft, images, sources, SUBJECT_PRESETS.find(s => s.id === settings.subject)?.label ?? '연예뉴스', photos)
  // Keep the existing post editor and archive useful for automated articles, too.
  const { data: post, error } = await db.from('blog_posts').insert({ user_id: userId, title, content: job.contentHtml, excerpt: intro.slice(0, 160), reading_minutes: Math.max(3, Math.ceil(draft.bodyChars / 500)) }).select('id').single()
  if (error || !post) throw new Error('생성한 글을 게시글 관리에 저장하지 못했습니다.')
  const { data: category } = await db.from('blog_categories').select('id').eq('user_id', userId).eq('name', settings.category).maybeSingle()
  let categoryId = category?.id
  if (!categoryId) {
    const { data: created, error: catError } = await db.from('blog_categories').insert({ user_id: userId, name: settings.category, slug: `news-${crypto.createHash('sha256').update(settings.category).digest('hex').slice(0, 12)}`, sort_order: 100 }).select('id').single()
    if (catError) throw new Error('글은 저장했지만 카테고리를 연결하지 못했습니다. 게시글 관리에서 확인해 주세요.')
    categoryId = created?.id
  }
  if (categoryId) { const { error: mapError } = await db.from('blog_post_categories').insert({ post_id: post.id, category_id: categoryId }); if (mapError) throw new Error('게시글 카테고리 연결에 실패했습니다.') }
  job.status = 'queued'
}
export async function generateJob(userId: string, scheduled = false, slot = 9) {
  return withUserLock(userId, async () => {
    const settings = await getSettings(userId)
    if (scheduled && (!settings.enabled || !resolvePublishHours(settings.publishHours).includes(slot))) return null
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
