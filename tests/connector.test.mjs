import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from '@playwright/test'
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
test('unknown image upload UI stops before saving or publishing', async () => {
  await browserPage(async page => {
    const result = await page.evaluate(task => globalThis.artroNaver.run(task, 'aGVsbG8='), task)
    assert.equal(result.status, 'needs_review')
    assert.match(result.error, /사진 업로드/)
    assert.equal(await page.evaluate(() => window.saves), 0)
    assert.equal(await page.evaluate(() => window.finalClicks), 0)
  })
})
