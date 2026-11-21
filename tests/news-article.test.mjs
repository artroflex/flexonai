import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNewsDraft, countNewsBody, bodyLengthAccepted, imageSectionIndices, resolveNewsImageCount, validateNewsQuotes, editorialPrompt } from '../lib/automation/article.ts'
import { renderNewsHtml, mobileLines, mobileParagraphs, photoCaption } from '../lib/automation/render.ts'
import { mergeNewsPools } from '../lib/automation/newsSelection.ts'

function fixture() {
  return { title: '신곡 공식 발표', intro: '공식 발표를 먼저 정리했어요.', sourceIds: [0, 1], tags: ['신곡'], sections: Array.from({ length: 4 }, (_, i) => ({ heading: `소식 ${i + 1}`, paragraphs: ['확인된 내용이에요.', '원문을 함께 확인할 수 있어요.'], sourceIds: [i % 2] })) }
}

test('mobile copy keeps Korean words intact, uses short lines and explicit paragraph gaps', () => {
  const copy = '둘째 날 앨범 부문 대상은 정규 5집 아리랑에 돌아갔습니다. 지난 3월 완전체로 돌아오며 발표한 앨범입니다.'
  const lines = mobileLines(copy)
  assert.equal(lines.join(' '), copy)
  assert.ok(lines.every(line => Array.from(line).length <= 16))
  const html = mobileParagraphs(copy)
  assert.ok((html.match(/data-mobile-gap/g) || []).length >= 3)
  assert.match(html, /<span style="font-size:19px;color:#222222;font-weight:400;">/)
  assert.ok(!html.includes('#C62828'))
  assert.equal(photoCaption(0, '2019-04-17'), '자료사진 1 · 2019 · 출처 하단')
  assert.ok(!photoCaption(0).includes('\n'))
})
test('body count excludes title, tags, source IDs and counts normalized Korean text with spaces', () => {
  const draft = fixture()
  const result = parseNewsDraft(draft, 2)
  const second = parseNewsDraft({ ...draft, title: '다른 제목', tags: ['전혀다른태그'] }, 2)
  assert.equal(result.bodyChars, second.bodyChars)
  assert.equal(countNewsBody('하나\n\n둘', []), 4)
  assert.equal(countNewsBody('가', []), 1)
})
test('only the requested 1500–2000 body characters and 4 or 5 images are accepted', () => {
  assert.equal(bodyLengthAccepted(1499), false)
  assert.equal(bodyLengthAccepted(1500), true)
  assert.equal(bodyLengthAccepted(2000), true)
  assert.equal(bodyLengthAccepted(2001), false)
  assert.equal(resolveNewsImageCount(undefined), 5)
  for (const count of [4, 5]) {
    assert.equal(resolveNewsImageCount(count), count)
    const placement = imageSectionIndices(count)
    assert.equal(placement.length + 1, count)
    assert.equal(new Set(placement).size, count - 1)
    assert.equal(placement.at(-1), 3)
  }
  for (const bad of [1, 3, 6, '5', null]) assert.throws(() => resolveNewsImageCount(bad))
})
test('four distinct sections with valid source references are required before buying images', () => {
  const draft = fixture()
  assert.equal(parseNewsDraft(draft, 2).sections.length, 4)
  assert.throws(() => parseNewsDraft({ ...draft, sections: draft.sections.slice(0, 3) }, 2))
  assert.throws(() => parseNewsDraft({ ...draft, sections: draft.sections.map(s => ({ ...s, sourceIds: [99] })) }, 2))
  assert.throws(() => parseNewsDraft({ ...draft, sourceIds: [0] }, 2))
  assert.throws(() => parseNewsDraft({ ...draft, sections: draft.sections.map(s => ({ ...s, paragraphs: ['한 문단만'] })) }, 2))
})

test('only verbatim sourced quotes render, with red headings and compact sources after hashtags', () => {
  const raw = { ...fixture(), quotes: [{ text: '공식 발표입니다.', speaker: '김가수', sourceId: 0, sectionIndex: 0 }] }
  const draft = parseNewsDraft(raw, 2)
  const articles = [{ title: '김가수 발표', snippet: '김가수는 “공식 발표입니다.”라고 밝혔다.' }, { title: '다른 기사', snippet: '' }]
  assert.doesNotThrow(() => validateNewsQuotes(draft, articles))
  assert.throws(() => validateNewsQuotes(draft, [{ title: '김가수', snippet: '다른 발언' }]))
  assert.throws(() => parseNewsDraft({ ...raw, quotes: [{ ...raw.quotes[0], sourceId: 1 }] }, 2))
  const html = renderNewsHtml(draft, ['https://example.com/1.png', 'https://example.com/2.png', 'https://example.com/3.png', 'https://example.com/4.png'], [{ source: '매체', title: '<script>뉴스</script>', link: 'https://example.com/news', pubDate: '2026-11-21' }], '스포츠')
  assert.match(html, /<blockquote/)
  assert.match(html, /font-size:24px;font-weight:700;color:#C62828/)
  assert.match(html, /font-size:19px/)
  assert.match(html, /font-size:11px;line-height:1.2;color:#777777/)
  assert.equal((html.match(/<img /g) || []).length, 4)
  assert.ok(html.indexOf('#신곡') < html.indexOf('>출처</p>'))
  assert.ok(!html.includes('<script>'))
  assert.match(editorialPrompt('sports', '정보 전달형'), /이 실행의 말투 선택: 정보 전달형/)
  assert.ok(!editorialPrompt('sports', '정보 전달형').includes('한국어 연예 블로그 에디터'))
})

test('a busy news category cannot crowd out other categories, and duplicate links use one slot', () => {
  const tv = Array.from({ length: 10 }, (_, i) => ({ link: `tv-${i}`, category: 'tv' }))
  const film = [{ link: 'film-0', category: 'film' }, { link: 'tv-0', category: 'film' }, { link: 'film-1', category: 'film' }]
  const music = [{ link: 'music-0', category: 'music' }]
  const merged = mergeNewsPools([tv, film, music], 6)
  assert.deepEqual(merged.slice(0, 3).map(a => a.category), ['tv', 'film', 'music'])
  assert.equal(merged.length, 6)
  assert.equal(new Set(merged.map(a => a.link)).size, merged.length)
  assert.ok(merged.some(a => a.link === 'film-1'))
})
