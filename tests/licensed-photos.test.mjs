import test from 'node:test'
import assert from 'node:assert/strict'
import { approvedLicense, photoFromCommons, findLicensedPhotos, downloadPhoto } from '../lib/automation/licensedPhotos.ts'
import { parseNewsDraft } from '../lib/automation/article.ts'
import { renderNewsHtml } from '../lib/automation/render.ts'

function fixture(index = 0) {
  return { title: `File:Seoul photograph ${index}.jpg`, imageinfo: [{ url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/Seoul-${index}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:Seoul-${index}.jpg`, mime: 'image/jpeg', size: 1000, width: 1200, height: 800, sha1: `sha-${index}`, metadata: [{ name: 'Make', value: 'Camera' }], extmetadata: { Artist: { value: '<a>Photographer</a>' }, Credit: { value: 'Own work' }, LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }, DateTimeOriginal: { value: '2020-01-01' } } }] }
}
test('only explicit matching commercial licenses are accepted', () => {
  assert.equal(approvedLicense('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'), true)
  assert.equal(approvedLicense('CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'), true)
  for (const [name, url] of [['CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/'], ['CC BY 4.0', 'https://example.com/'], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/3.0/'], ['Public domain', ''], ['', '']]) assert.equal(approvedLicense(name, url), false)
})
test('a search result is insufficient without photo evidence, exact relevance and complete rights', () => {
  assert.ok(photoFromCommons(fixture(), 'Seoul'))
  assert.equal(photoFromCommons(fixture(), 'Busan'), null)
  for (const mutate of [p => p.imageinfo[0].metadata = [], p => p.imageinfo[0].extmetadata.Artist.value = '', p => p.imageinfo[0].extmetadata.Restrictions = { value: 'personality' }, p => p.imageinfo[0].extmetadata.Categories = { value: 'AI-generated images' }, p => p.imageinfo[0].url = 'https://localhost/private', p => p.imageinfo[0].extmetadata.LicenseUrl.value = '']) {
    const p = fixture(); mutate(p); assert.equal(photoFromCommons(p, 'Seoul'), null)
  }
})
test('collects distinct licensed originals and holds publication if photos are insufficient', async () => {
  const request = async () => Response.json({ query: { pages: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, fixture(i)])) } })
  const result = await findLicensedPhotos(['Seoul'], 4, request)
  assert.equal(result.length, 4)
  assert.equal(new Set(result.map(p => p.sha1)).size, 4)
  await assert.rejects(findLicensedPhotos(['Busan'], 4, request), /발행을 보류/)
  await assert.rejects(findLicensedPhotos(['Seoul'], 4, async () => Response.json({}, { status: 503 })), /대체하지 않습니다/)
})
test('photo download rejects arbitrary origins, wrong MIME and oversized responses', async () => {
  const photo = photoFromCommons(fixture(), 'Seoul')
  await assert.rejects(downloadPhoto({ ...photo, originalUrl: 'https://localhost/private' }), /주소/)
  await assert.rejects(downloadPhoto(photo, async () => new Response('bad', { headers: { 'content-type': 'text/html' } })), /원본/)
  await assert.rejects(downloadPhoto(photo, async () => new Response('bad', { headers: { 'content-type': 'image/jpeg', 'content-length': '99999999' } })), /원본/)
  const bytes = await downloadPhoto(photo, async () => new Response(new Uint8Array([255, 216, 255]), { headers: { 'content-type': 'image/jpeg' } }))
  assert.deepEqual([...bytes], [255, 216, 255])
})

test('real photos are labeled as archive material and credited after hashtags without AI claims', () => {
  const photos = Array.from({ length: 4 }, (_, i) => photoFromCommons(fixture(i), 'Seoul'))
  const draft = parseNewsDraft({ title: '서울 소식', intro: '확인된 소식입니다.', sourceIds: [0, 1], tags: ['서울'], sections: Array.from({ length: 4 }, (_, i) => ({ heading: `정보 ${i}`, paragraphs: ['확인한 내용입니다.', '맥락을 정리합니다.'], sourceIds: [0, 1] })) }, 2)
  const html = renderNewsHtml(draft, photos.map(p => p.url), [], '여행', photos)
  assert.ok(!html.includes('AI 제작'))
  assert.match(html, /이번 기사·방송 장면이 아닙니다/)
  assert.match(html, /촬영: 2020-01-01/)
  assert.ok(html.indexOf('#서울') < html.indexOf('사진 1:'))
  for (const photo of photos) { assert.ok(html.includes(photo.sourceUrl)); assert.ok(html.includes(photo.licenseUrl)); assert.ok(html.includes(photo.author)) }
})
