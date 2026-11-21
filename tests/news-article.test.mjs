import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNewsDraft, countNewsBody, bodyLengthAccepted, imageSectionIndices, resolveNewsImageCount } from '../lib/automation/article.ts'
import { mergeNewsPools } from '../lib/automation/newsSelection.ts'

function fixture() {
  return { title: '신곡 공식 발표', intro: '공식 발표를 먼저 정리했어요.', sourceIds: [0, 1], tags: ['신곡'], sections: Array.from({ length: 4 }, (_, i) => ({ heading: `소식 ${i + 1}`, paragraphs: ['확인된 내용이에요.', '원문을 함께 확인할 수 있어요.'], sourceIds: [i % 2] })) }
}
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
