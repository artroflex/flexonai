import { escapeHtml, kstDate } from './rules.ts'
import { imageSectionIndices, type NewsDraft } from './article.ts'
import type { LicensedPhoto } from './licensedPhotos.ts'

const bodyStyle = 'font-size:19px;line-height:1.7;color:#222222;font-weight:400;text-align:center;margin:0 0 20px;'
const headingStyle = 'font-size:24px;font-weight:700;color:#C62828;line-height:1.4;margin:32px 0 16px;'
const smallStyle = 'font-size:11px;line-height:1.2;color:#777777;font-weight:400;margin:2px 0;'
const bodyTextStyle = 'font-size:19px;color:#222222;font-weight:400;'
export const paragraphGap = `<p data-mobile-gap="true" style="${bodyStyle}"><span style="${bodyTextStyle}">&nbsp;</span></p>`
/** Keep words intact and leave space between blocks even when Naver drops margins. */
export function mobileLines(text: string): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.trim().split(/\s+/u).filter(Boolean)) {
    if (line && Array.from(`${line} ${word}`).length > 16) { lines.push(line); line = word }
    else line += `${line ? ' ' : ''}${word}`
  }
  if (line) lines.push(line)
  return lines
}
export function mobileParagraphs(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?。！？])\s+/u)
  const blocks: string[] = []
  for (const sentence of sentences) {
    const lines = mobileLines(sentence)
    for (let i = 0; i < lines.length; i += 2) blocks.push(`<p style="${bodyStyle}">${lines.slice(i, i + 2).map(s => `<span style="${bodyTextStyle}">${escapeHtml(s)}</span>`).join('<br/>')}</p>${paragraphGap}`)
  }
  return blocks.join('')
}
export function photoCaption(index: number, capturedAt?: string): string {
  const year = capturedAt?.match(/\b(?:19|20)\d{2}\b/)?.[0]
  return `자료사진 ${index + 1}${year ? ` · ${year}` : ''} · 출처 하단`
}
export function renderNewsHtml(draft: NewsDraft, images: string[], sources: { link: string; source: string; title: string; pubDate: string }[], subject: string, photos: LicensedPhoto[] = []): string {
  const small = (s: string) => `<span style="font-size:11px;color:#777777;font-weight:400;">${escapeHtml(s)}</span>`
  const heading = (s: string) => `<h2 style="${headingStyle}"><span style="font-size:24px;color:#C62828;font-weight:700;">${escapeHtml(s)}</span></h2>`
  const figure = (url: string, caption: string) => {
    const index = photos.findIndex(p => p.url === url), photo = photos[index]
    const label = photo ? photoCaption(index, photo.capturedAt) : 'AI 일러스트 · 실제 장면 아님'
    return `<figure style="margin:20px 0;"><img style="max-width:100%;height:auto;" src="${escapeHtml(url)}" alt="${escapeHtml(photo?.title || caption)}"/><figcaption style="${smallStyle}">${small(label)}</figcaption></figure>`
  }
  const placement = new Map(imageSectionIndices(images.length as 4 | 5).map((sectionIndex, i) => [sectionIndex, images[i + 1]]))
  const sections = draft.sections.map((section, index) => `${heading(section.heading)}${section.paragraphs.map(mobileParagraphs).join('')}${draft.quotes.filter(q => q.sectionIndex === index).map(q => `<blockquote style="border-left:4px solid #C62828;margin:20px 0;padding:12px 16px;background:#fff5f5;">${mobileParagraphs(`“${q.text}”`)}<p style="${smallStyle}">${small(`— ${q.speaker}`)}</p></blockquote>`).join('')}${placement.has(index) ? figure(placement.get(index)!, section.heading) : ''}`).join('')
  const tags = [...new Set(draft.tags.map(t => '#' + t.replace(/[^가-힣a-zA-Z0-9]/g, '')).filter(t => t.length > 1))]
  if (!tags.length) tags.push('#' + subject.replace(/[^가-힣a-zA-Z0-9]/g, ''))
  const photoCredits = photos.map((photo, i) => `<p style="${smallStyle}">사진 ${i + 1}: <a href="${escapeHtml(photo.sourceUrl)}">${escapeHtml(photo.title)}</a> / ${escapeHtml(photo.author)} / ${escapeHtml(photo.credit)} / <a href="${escapeHtml(photo.licenseUrl)}">${escapeHtml(photo.license)}</a>${photo.capturedAt ? ` · 촬영: ${escapeHtml(photo.capturedAt)}` : ''} · 원본 무편집 · 이용 조건 확인 ${kstDate(new Date(photo.checkedAt))}</p>`).join('')
  return `${heading('핵심 요약')}${mobileParagraphs(draft.intro)}${figure(images[0], draft.title)}${sections}<p style="${smallStyle}">${small('공개된 기사 제목·요약을 AI로 정리했습니다. 자료사진은 이번 기사·방송 장면이 아닙니다.')}</p>${mobileParagraphs(tags.join(' '))}<p style="${smallStyle}">출처</p>${sources.map((a, index) => `<p style="${smallStyle}">${index + 1}. <a style="color:#777777;font-weight:400;" href="${escapeHtml(a.link)}">${small(`${a.source} · ${a.title}`)}</a> (${kstDate(new Date(a.pubDate))})</p>`).join('')}${photoCredits}`
}
