import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { mobileParagraphs } from '../lib/automation/render.ts'
const adapter = await fs.readFile(new URL('../connector/naver.js', import.meta.url), 'utf8')
const task = { blogId: 'srluxury17', category: '연예뉴스', title: '신곡 발매 소식', mode: 'draft', contentHtml: '<p>공식 발표를 확인했습니다.</p><h2>발매 정보</h2><p>원문 출처에서 자세히 확인하세요.</p>' }
const fixture = `<!doctype html><body><div class="se-title-text"><p class="se-text-paragraph" contenteditable="true"></p></div><div class="se-component se-text"><p class="se-text-paragraph" contenteditable="true"></p></div><button id="save">저장</button><button id="open">발행</button><div id="proof"></div><script>
window.finalClicks=0;window.saves=0;
document.querySelector('#save').onclick=()=>document.querySelector('#proof').textContent='임시저장 완료 '+(++window.saves);
document.querySelector('#open').onclick=()=>{const p=document.createElement('div');p.className='publish_layer';p.setAttribute('role','dialog');p.innerHTML='<button id="category">카테고리 선택</button><button id="close">닫기</button><button id="final">발행</button>';document.body.append(p);p.querySelector('#close').onclick=()=>p.remove();p.querySelector('#final').onclick=()=>window.finalClicks++;p.querySelector('#category').onclick=()=>{const b=document.createElement('button');b.setAttribute('role','option');b.textContent='연예뉴스';p.append(b);b.onclick=()=>{p.querySelector('#category').textContent='카테고리 연예뉴스';b.remove()}}};
</script></body>`
async function browserPage(fn) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    await page.route('https://blog.naver.com/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }))
    await page.goto('https://blog.naver.com/srluxury17?Redirect=Write')
    await page.addScriptTag({ content: adapter })
    await fn(page)
  } finally { await browser.close() }
}
test('draft mode saves text and category without pressing final publish', async () => {
  await browserPage(async page => {
    const result = await page.evaluate(task => globalThis.artroNaver.run(task, null), task)
    assert.equal(result.status, 'draft_saved', `${result.error}\n${await page.locator('body').innerHTML()}`)
    assert.match(result.draftProof, /연예뉴스/)
    assert.equal(await page.evaluate(() => window.finalClicks), 0)
    assert.equal(await page.evaluate(() => window.saves), 2)
    assert.equal(await page.locator('.se-title-text').innerText(), task.title)
    assert.match(await page.locator('.se-component.se-text').innerText(), /공식 발표/)
  })
})

test('mobile paragraphs retain black normal text and blank gaps inside a red bold editor', async () => {
  await browserPage(async page => {
    await page.locator('.se-component').evaluate(el => { el.style.color = '#c62828'; el.style.fontWeight = '700' })
    const contentHtml = mobileParagraphs('모바일에서 한 번에 읽기 쉽도록 문단을 짧게 나눕니다. 다른 내용은 새 단락에서 설명합니다.')
    const result = await page.evaluate(task => globalThis.artroNaver.run(task, null), { ...task, contentHtml })
    assert.equal(result.status, 'draft_saved', result.error)
    assert.ok(await page.locator('[data-mobile-gap]').count() >= 2)
    const style = await page.locator('.se-component').evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let node
      while ((node = walker.nextNode())) if (node.textContent.includes('모바일에서')) {
        const computed = getComputedStyle(node.parentElement)
        return { color: computed.color, weight: computed.fontWeight }
      }
    })
    assert.deepEqual(style, { color: 'rgb(34, 34, 34)', weight: '400' })
  })
})
test('existing user draft and wrong account fail closed without changing text', async () => {
  await browserPage(async page => {
    await page.locator('.se-title-text p').fill('기존 사용자 글')
    const result = await page.evaluate(task => globalThis.artroNaver.run(task, null), task)
    assert.equal(result.status, 'needs_review')
    assert.equal(await page.locator('.se-title-text').innerText(), '기존 사용자 글')
    const wrong = await page.evaluate(task => globalThis.artroNaver.run({ ...task, blogId: 'otherblog' }, null), task)
    assert.equal(wrong.status, 'needs_review')
    assert.equal(await page.evaluate(() => window.finalClicks), 0)
  })
})

test('red headings, short paragraphs, quote blocks and small sources retain rich formatting', async () => {
  await browserPage(async page => {
    const contentHtml = '<h2 style="color:#C62828;font-size:24px;font-weight:700">확인된 소식</h2><p style="font-size:19px">첫 문장이에요.<br/>다음 문장이에요.</p><blockquote style="border-left:4px solid #C62828"><p>실제 발언입니다.</p><p style="font-size:11px">— 발언자</p></blockquote><p>#소식</p><p style="font-size:11px;line-height:1.2;color:#777777">출처</p>'
    const result = await page.evaluate(task => globalThis.artroNaver.run(task, null), { ...task, contentHtml })
    assert.equal(result.status, 'draft_saved', result.error)
    assert.equal(await page.locator('.se-component h2').evaluate(el => getComputedStyle(el).color), 'rgb(198, 40, 40)')
    assert.equal(await page.locator('.se-component h2').evaluate(el => getComputedStyle(el).fontSize), '24px')
    assert.equal(await page.locator('.se-component blockquote').count(), 1)
    assert.equal(await page.locator('.se-component blockquote').innerText().then(t => (t.match(/실제 발언입니다/g) || []).length), 1)
    assert.equal(await page.locator('.se-component p').filter({ hasText: /^출처$/ }).evaluate(el => getComputedStyle(el).fontSize), '11px')
    assert.equal(await page.evaluate(() => window.finalClicks), 0)
  })
})
test('unknown image upload UI stops before saving or publishing', async () => {
  await browserPage(async page => {
    const result = await page.evaluate(task => globalThis.artroNaver.run(task, 'aGVsbG8='), task)
    assert.equal(result.status, 'needs_review')
    assert.match(result.error, /사진 업로드/)
    assert.equal(await page.evaluate(() => window.saves), 0)
    assert.equal(await page.evaluate(() => window.finalClicks), 0)
  })
})

for (const count of [4, 5]) test(`${count} images are uploaded between text sections without overwriting earlier paragraphs`, async () => {
  const png = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffedd5' } }).png().toBuffer()).toString('base64')
  await browserPage(async page => {
    await page.evaluate(() => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/png'; document.body.append(input)
      input.onchange = () => {
        const image = document.createElement('div'); image.className = 'se-component se-image'
        const img = document.createElement('img'); img.src = URL.createObjectURL(input.files[0]); image.append(img)
        const body = document.createElement('div'); body.className = 'se-component se-text'
        const p = document.createElement('p'); p.className = 'se-text-paragraph'; p.contentEditable = 'true'; body.append(p)
        const components = document.querySelectorAll('.se-component'); components[components.length - 1].after(image, body)
      }
    })
    const urls = Array.from({ length: count }, (_, i) => `https://example.invalid/news-${i}.png`)
    const contentHtml = `<p>핵심 요약이 먼저 보여요.</p><figure><img src="${urls[0]}"/><figcaption>표지 설명이에요.</figcaption></figure>` + Array.from({ length: 4 }, (_, i) => `<h2>구간 ${i + 1}</h2><p>본문 ${i + 1}을 설명해요.</p>${i < count - 1 ? `<figure><img src="${urls[i + 1]}"/><figcaption>구간 이미지 ${i + 1} 설명</figcaption></figure>` : ''}`).join('') + '<p>원문 출처와 마무리예요.</p>'
    const result = await page.evaluate(({ task, images }) => globalThis.artroNaver.run(task, images), { task: { ...task, contentHtml, imageUrls: urls }, images: urls.map(url => ({ url, data: png })) })
    assert.equal(result.status, 'draft_saved', result.error)
    assert.equal(await page.locator('.se-component.se-image img').count(), count)
    const components = await page.locator('.se-component').evaluateAll(nodes => nodes.map(el => el.matches('.se-image') ? '[IMAGE]' : el.innerText))
    assert.match(components[0], /핵심 요약/)
    assert.equal(components[1], '[IMAGE]')
    for (let i = 1; i <= 4; i++) assert.match(components.join('\n'), new RegExp(`본문 ${i}을 설명해요`))
    assert.match(components.at(-1), /원문 출처와 마무리/)
    assert.equal(await page.evaluate(() => window.finalClicks), 0)
  })
})

test('old connectors missing any planned image cannot save or publish a multi-image post', async () => {
  await browserPage(async page => {
    const result = await page.evaluate(task => globalThis.artroNaver.run({ ...task, contentHtml: '<p>요약입니다.</p><img src="https://example.invalid/1.png"/><img src="https://example.invalid/2.png"/>' }, [{ url: 'https://example.invalid/1.png', data: 'aGVsbG8=' }]), task)
    assert.equal(result.status, 'needs_review')
    assert.match(result.error, /최신 연결 도구/)
    assert.equal(await page.locator('.se-title-text').innerText(), '')
    assert.equal(await page.evaluate(() => window.saves), 0)
  })
})
