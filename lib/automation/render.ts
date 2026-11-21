import { escapeHtml, kstDate } from './rules.ts'
import { imageSectionIndices, type NewsDraft } from './article.ts'
import type { LicensedPhoto } from './licensedPhotos.ts'

const bodyStyle = 'font-size:19px;line-height:1.7;color:#222222;margin:0 0 20px;'
const headingStyle = 'font-size:24px;font-weight:700;color:#C62828;line-height:1.4;margin:32px 0 16px;'
const smallStyle = 'font-size:11px;line-height:1.2;color:#777777;margin:2px 0;'
/** Short, semantic paragraphs survive narrow screens without breaking Korean words. */
export function mobileParagraphs(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?。！？])\s+/u)
  const blocks: string[] = []
  for (let i = 0; i < sentences.length; i += 2) blocks.push(`<p style="${bodyStyle}">${sentences.slice(i, i + 2).map(escapeHtml).join('<br/>')}</p>`)
  return blocks.join('')
}
export function renderNewsHtml(draft: NewsDraft, images: string[], sources: { link: string; source: string; title: string; pubDate: string }[], subject: string, photos: LicensedPhoto[] = []): string {
  const heading = (s: string) => `<h2 style="${headingStyle}">${escapeHtml(s)}</h2>`
  const figure = (url: string, caption: string) => {
    const index = photos.findIndex(p => p.url === url), photo = photos[index]
    const label = photo ? `자료사진 ${index + 1} · ${photo.title}${photo.capturedAt ? ` · 촬영: ${photo.capturedAt}` : ''} · 이번 기사·방송 장면이 아닙니다. 사진 이용 정보는 글 끝에 표기했습니다.` : `${caption} · AI 제작 일러스트, 실제 인물·현장 사진이 아닙니다.`
    return `<figure style="margin:20px 0;"><img style="max-width:100%;height:auto;" src="${escapeHtml(url)}" alt="${escapeHtml(label)}"/><figcaption style="${smallStyle}">${escapeHtml(label)}</figcaption></figure>`
  }
  const placement = new Map(imageSectionIndices(images.length as 4 | 5).map((sectionIndex, i) => [sectionIndex, images[i + 1]]))
  const sections = draft.sections.map((section, index) => `${heading(section.heading)}${section.paragraphs.map(mobileParagraphs).join('')}${draft.quotes.filter(q => q.sectionIndex === index).map(q => `<blockquote style="border-left:4px solid #C62828;margin:20px 0;padding:12px 16px;background:#fff5f5;"><p style="${bodyStyle}">“${escapeHtml(q.text)}”</p><p style="${smallStyle}">— ${escapeHtml(q.speaker)}</p></blockquote>`).join('')}${placement.has(index) ? figure(placement.get(index)!, section.heading) : ''}`).join('')
  const tags = [...new Set(draft.tags.map(t => '#' + t.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(t => t.length > 1))]
  if (!tags.length) tags.push('#' + subject.replace(/[^가-힣a-zA-Z0-9]/g, ''))
  const photoCredits = photos.map((photo, i) => `<p style="${smallStyle}">사진 ${i + 1}: <a href="${escapeHtml(photo.sourceUrl)}">${escapeHtml(photo.title)}</a> / ${escapeHtml(photo.author)} / ${escapeHtml(photo.credit)} / <a href="${escapeHtml(photo.licenseUrl)}">${escapeHtml(photo.license)}</a> · 원본 무편집 · 이용 조건 확인 ${kstDate(new Date(photo.checkedAt))}</p>`).join('')
  return `${heading('핵심 요약')}${mobileParagraphs(draft.intro)}${figure(images[0], draft.title)}${sections}<p style="${smallStyle}">공개된 기사 제목·요약을 AI로 정리했습니다. 자세한 맥락은 아래 원문에서 확인해 주세요.</p><p style="${bodyStyle}">${escapeHtml(tags.join(' '))}</p><p style="${smallStyle}">출처</p>${sources.map((a, index) => `<p style="${smallStyle}">${index + 1}. <a style="color:#777777;" href="${escapeHtml(a.link)}">${escapeHtml(a.source)} · ${escapeHtml(a.title)}</a> (${kstDate(new Date(a.pubDate))})</p>`).join('')}${photoCredits}`
}
