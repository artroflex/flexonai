export interface LicensedPhoto {
  url: string
  originalUrl: string
  sourceUrl: string
  title: string
  author: string
  credit: string
  license: string
  licenseUrl: string
  checkedAt: string
  capturedAt: string
  sha1: string
  mime: 'image/jpeg' | 'image/png'
}
type Value = { value?: string }
export type CommonsPage = { title?: string; imageinfo?: { url?: string; descriptionurl?: string; mime?: string; size?: number; width?: number; height?: number; sha1?: string; metadata?: { name: string; value: unknown }[]; extmetadata?: Record<string, Value> }[] }
const clean = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim()
const normalized = (s: string) => clean(s).normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const MAX_BYTES = 12 * 1024 * 1024

/** An explicit allowlist; missing/ambiguous terms never mean permission. */
export function canonicalLicenseUrl(url: string): string {
  try {
    const u = new URL(url)
    if (!['http:', 'https:'].includes(u.protocol) || u.hostname !== 'creativecommons.org' || u.username || u.password || u.port || u.search || u.hash) return ''
    const match = u.pathname.match(/^\/(licenses\/by\/(?:4\.0|3\.0|2\.5|2\.0|1\.0)|publicdomain\/zero\/1\.0)\/(?:deed(?:\.[a-z-]+)?|legalcode(?:\.[a-z-]+)?)?$/i)
    return match ? `https://creativecommons.org/${match[1]}/` : ''
  } catch { return '' }
}
export function approvedLicense(name: string, url: string): boolean {
  const canonical = canonicalLicenseUrl(url)
  if (/^CC0(?: 1\.0)?$/i.test(name)) return canonical === 'https://creativecommons.org/publicdomain/zero/1.0/'
  const match = name.match(/^CC BY (4\.0|3\.0|2\.5|2\.0|1\.0)$/i)
  return !!match && canonical === `https://creativecommons.org/licenses/by/${match[1]}/`
}
export function photoFromCommons(page: CommonsPage, query: string, checkedAt = new Date().toISOString()): LicensedPhoto | null {
  const i = page.imageinfo?.[0], m = i?.extmetadata ?? {}
  const get = (key: string) => clean(m[key]?.value)
  if (!i?.url || !i.descriptionurl || !i.sha1 || !['image/jpeg', 'image/png'].includes(i.mime ?? '') || !i.size || i.size > MAX_BYTES || (i.width ?? 0) < 600 || (i.height ?? 0) < 400) return null
  try {
    const media = new URL(i.url), source = new URL(i.descriptionurl)
    if (media.protocol !== 'https:' || media.hostname !== 'upload.wikimedia.org' || !media.pathname.startsWith('/wikipedia/commons/') || media.username || media.password || source.protocol !== 'https:' || source.hostname !== 'commons.wikimedia.org' || !source.pathname.startsWith('/wiki/File:')) return null
  } catch { return null }
  const license = get('LicenseShortName'), licenseUrl = m.LicenseUrl?.value ?? ''
  const author = get('Artist'), credit = [...new Set([get('Attribution'), get('Credit')].filter(Boolean))].join(' · ')
  const description = `${page.title ?? ''} ${get('ImageDescription')} ${get('ObjectName')}`
  const categories = get('Categories')
  // Require original camera metadata, not merely a bitmap MIME or a search hit.
  const camera = i.metadata?.some(v => /^(Make|Model)$/i.test(v.name) && typeof v.value === 'string' && v.value.trim()) ||
    (i.metadata?.some(v => v.name === 'DateTimeOriginal' && v.value) && i.metadata?.some(v => /^(ExposureTime|ShutterSpeedValue|FocalLength)$/.test(v.name) && v.value))
  if (!camera || !author || author.length > 600 || credit.length > 1500 || !approvedLicense(license, licenseUrl)) return null
  if (get('Restrictions') || /license review needed|license review failed|copyright violations|deletion requests|AI.generated|synthetic media|screenshots|posters|logos|artwork/i.test(categories)) return null
  if (/AI.generated|computer.generated|illustration|screenshot|poster|logo|일러스트|합성|방송 캡처/i.test(description)) return null
  if (normalized(query).length < 2 || !normalized(description).includes(normalized(query))) return null
  return { url: i.url, originalUrl: i.url, sourceUrl: i.descriptionurl, title: clean(page.title?.replace(/^File:/, '') ?? ''), author, credit, license, licenseUrl: canonicalLicenseUrl(licenseUrl), checkedAt, capturedAt: get('DateTimeOriginal'), sha1: i.sha1, mime: i.mime as LicensedPhoto['mime'] }
}
export async function findLicensedPhotos(queries: string[], count: 4 | 5, request: typeof fetch = fetch, signal?: AbortSignal): Promise<LicensedPhoto[]> {
  const photos: LicensedPhoto[] = []
  for (const query of [...new Set(queries)].slice(0, 3)) {
    const endpoint = new URL('https://commons.wikimedia.org/w/api.php')
    endpoint.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `"${query.replace(/["\\]/g, '')}" filetype:bitmap`, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime|size|sha1|metadata|extmetadata' }).toString()
    const response = await request(endpoint.toString(), { headers: { 'user-agent': 'artroBLOG/1.0 (https://artroblog.vercel.app/about)' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('실제 사진 검색에 연결하지 못했습니다. 이미지 생성으로 대체하지 않습니다.')
    const data = await response.json()
    if (data.error) throw new Error('실제 사진 이용 조건을 조회하지 못했습니다.')
    for (const page of Object.values(data.query?.pages ?? {}) as CommonsPage[]) {
      const photo = photoFromCommons(page, query)
      if (photo && !photos.some(p => p.sha1 === photo.sha1)) photos.push(photo)
      if (photos.length === count) return photos
    }
  }
  throw new Error(`관련 실제 사진 ${photos.length}장만 이용 조건을 확인했습니다. 필요한 ${count}장을 확보하지 못해 발행을 보류합니다.`)
}
export async function downloadPhoto(photo: LicensedPhoto, request: typeof fetch = fetch, signal?: AbortSignal): Promise<Uint8Array> {
  // Re-validate the destination even when called with a persisted asset.
  const u = new URL(photo.originalUrl)
  if (u.protocol !== 'https:' || u.hostname !== 'upload.wikimedia.org' || !u.pathname.startsWith('/wikipedia/commons/')) throw new Error('사진 다운로드 주소를 확인하지 못했습니다.')
  const response = await request(u.toString(), { redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000), headers: { 'user-agent': 'artroBLOG/1.0 (https://artroblog.vercel.app/about)' } })
  if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== photo.mime || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) throw new Error('사진 원본을 내려받지 못했습니다.')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > MAX_BYTES) throw new Error('사진 파일 크기가 제한을 초과했습니다.')
      chunks.push(next.value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
