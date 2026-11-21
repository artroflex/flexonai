// Fail closed when the editor changes. No anti-bot, login or CAPTCHA bypasses.
(() => {
  if (globalThis.artroNaver) return
  const titleNode = () => document.querySelector('.se-title-text .se-text-paragraph, .se-title-text [contenteditable="true"]')
  const bodyNode = () => document.querySelector('.se-component.se-text .se-text-paragraph, .se-text:not(.se-title-text) .se-text-paragraph')
  const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  const text = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim()
  const buttons = () => Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)
  function uniqueButton(pattern) { const all = buttons().filter(el => pattern.test(text(el))); if (all.length !== 1) throw new Error(`편집기 버튼을 안전하게 식별하지 못했습니다 (${pattern.source}: ${all.length}개). 네이버에서 직접 확인해 주세요.`); return all[0] }
  async function waitFor(probe, timeout = 12000) {
    const until = Date.now() + timeout
    while (Date.now() < until) { const value = probe(); if (value) return value; await new Promise(r => setTimeout(r, 250)) }
    throw new Error('네이버 화면의 처리 완료를 확인하지 못했습니다.')
  }
  function insert(node, value, html = null) {
    node.focus()
    const selection = window.getSelection(), range = document.createRange()
    range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range)
    if (!document.execCommand(html ? 'insertHTML' : 'insertText', false, html || value)) throw new Error('편집기가 본문 입력을 받지 않았습니다.')
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: html ? 'insertFromPaste' : 'insertText', data: value }))
  }
  async function run(task, image) {
    try {
      if (location.hostname !== 'blog.naver.com' || !/^[a-zA-Z0-9_-]{3,50}$/.test(task.blogId)) throw new Error('대상 블로그를 확인하지 못했습니다.')
      const params = new URL(location.href).searchParams
      const pathBlogId = location.pathname.split('/').filter(Boolean)[0]
      if (params.get('blogId') !== task.blogId && pathBlogId !== task.blogId) throw new Error('로그인한 글쓰기 화면의 블로그 ID가 다릅니다.')
      const title = await waitFor(titleNode), body = await waitFor(bodyNode)
      if (text(title) && text(title) !== '제목') throw new Error('기존 제목이 있어 입력하지 않았습니다.')
      if (text(body) && !/^(글 내용을 입력|여기에|내용을 입력)/.test(text(body))) throw new Error('기존 본문이 있어 입력하지 않았습니다.')
      if (document.querySelector('.se-component.se-image')) throw new Error('기존 이미지가 있어 입력하지 않았습니다.')
      const parsed = new DOMParser().parseFromString(task.contentHtml, 'text/html')
      const plannedImages = Array.from(parsed.querySelectorAll('img')).map(img => img.getAttribute('src'))
      const images = typeof image === 'string' ? [{ url: plannedImages[0] || null, data: image }] : image || []
      if (plannedImages.length && (images.length !== plannedImages.length || plannedImages.some(url => !images.some(img => img.url === url)))) throw new Error('본문 이미지가 모두 전달되지 않았습니다. 최신 연결 도구를 설치해 주세요.')
      const flow = []
      let lines = [], markup = []
      function flush() { if (lines.length) { flow.push({ type: 'text', value: lines.join('\n\n'), html: markup.join('') }); lines = []; markup = [] } }
      for (const el of parsed.querySelectorAll('p,h2,blockquote,figcaption,img')) {
        if (el.parentElement?.closest('blockquote')) continue
        if (el.tagName === 'IMG') { flush(); flow.push({ type: 'image', url: el.getAttribute('src') }); continue }
        if (el.hasAttribute('data-mobile-gap')) { markup.push(el.outerHTML); continue }
        const links = Array.from(el.querySelectorAll('a')).map(a => a.getAttribute('href')).filter(href => /^https:\/\//.test(href || ''))
        const line = [el.textContent.trim(), ...links].filter(Boolean).join('\n')
        if (line) { lines.push(line); markup.push(el.outerHTML) }
      }
      flush()
      // Legacy one-image jobs without an HTML image node are still supported.
      if (!plannedImages.length && images.length) flow.push({ type: 'image', url: images[0].url })
      if (flow[0]?.type !== 'text') throw new Error('뉴스 본문은 텍스트 요약으로 시작해야 합니다.')
      insert(title, task.title)
      let textWritten = false, lastImage = null, uploadedCount = 0
      for (const block of flow) {
        if (block.type === 'text') {
          if (!textWritten) { insert(body, block.value, block.html); textWritten = true }
          else {
            const paragraph = await waitFor(() => {
              const list = Array.from(document.querySelectorAll('.se-component.se-text .se-text-paragraph, .se-text:not(.se-title-text) .se-text-paragraph'))
              const last = list[list.length - 1]
              return last && (!lastImage || (lastImage.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)) ? last : null
            })
            paragraph.focus()
            const selection = window.getSelection(), range = document.createRange()
            range.selectNodeContents(paragraph); range.collapse(false); selection.removeAllRanges(); selection.addRange(range)
            if (!document.execCommand('insertHTML', false, (text(paragraph) ? '<p><br/></p>' : '') + block.html)) throw new Error('이미지 뒤 서식 본문을 입력하지 못했습니다.')
            paragraph.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: block.value }))
          }
          // SmartEditor turns <br> into paragraphs, so compare text without layout whitespace.
          const expected = block.value.split('\n')[0].replace(/\s+/g, '')
          await waitFor(() => document.body.innerText.replace(/\s+/g, '').includes(expected))
        } else {
          const payload = images.find(img => img.url === block.url)
          if (!payload?.data) throw new Error('본문에 필요한 이미지가 없습니다.')
          const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(el => /image|png|jpg/i.test(el.accept))
          if (inputs.length !== 1) throw new Error('사진 업로드 입력란을 확인하지 못했습니다. 최신 연결 도구와 네이버 편집기를 확인해 주세요.')
          const bytes = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0))
          const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png'
          const transfer = new DataTransfer(); transfer.items.add(new File([bytes], `artro-news-${uploadedCount + 1}.${mime === 'image/jpeg' ? 'jpg' : 'png'}`, { type: mime }))
          inputs[0].files = transfer.files; inputs[0].dispatchEvent(new Event('change', { bubbles: true }))
          const loaded = await waitFor(() => {
            const nodes = Array.from(document.querySelectorAll('.se-component.se-image img')).filter(img => img.complete && img.naturalWidth > 0)
            return nodes.length === uploadedCount + 1 ? nodes : null
          }, 25000)
          lastImage = loaded[loaded.length - 1].closest('.se-component.se-image'); uploadedCount++
        }
      }
      if (uploadedCount !== images.length || !text(titleNode()).includes(task.title)) throw new Error('제목 또는 전체 이미지 입력 결과를 확인하지 못했습니다.')
      const save = uniqueButton(/^(?:임시)?저장(?:\s*\d+)?$/)
      const before = document.body.innerText
      save.click()
      const proof = await waitFor(() => {
        const current = document.body.innerText
        const match = current.match(/(?:임시\s*저장|저장)(?:이|가)?\s*(?:되었|됐|완료)[^\n]{0,60}/)
        return match && current !== before ? match[0] : null
      }, 15000)
      // Open publishing settings only to choose the category. The final publish button is
      // reachable only for a job that was explicitly upgraded after a verified draft.
      uniqueButton(/^발행$/).click()
      const categoryButtons = await waitFor(() => {
        const list = buttons().filter(el => /카테고리/.test(text(el)))
        return list.length === 1 ? list : null
      })
      categoryButtons[0].click()
      const target = await waitFor(() => {
        const options = Array.from(document.querySelectorAll('[role="option"],label,button,[role="treeitem"]')).filter(el => visible(el) && text(el) === task.category)
        return options.length === 1 ? options[0] : null
      })
      target.click()
      await waitFor(() => buttons().some(el => text(el).includes(task.category)))
      if (task.mode === 'draft') {
        // Category belongs to publishing settings in SmartEditor. Close the dialog,
        // save again, then let the user verify its persistence before enabling publish.
        uniqueButton(/^(닫기|취소)$/).click()
        const previous = document.body.innerText
        uniqueButton(/^(?:임시)?저장(?:\s*\d+)?$/).click()
        await waitFor(() => document.body.innerText !== previous && /(?:임시\s*저장|저장)(?:이|가)?\s*(?:되었|됐|완료)/.test(document.body.innerText))
        return { status: 'draft_saved', draftProof: `${new Date().toISOString()} ${proof} / ${task.title} / 카테고리 선택: ${task.category}` }
      }
      if (task.mode !== 'publish') throw new Error('알 수 없는 발행 모드입니다.')
      // Scope the final action to a visible publish panel. Never click an arbitrary page button.
      const panels = Array.from(document.querySelectorAll('[role="dialog"], .publish_layer, [class*="publish_layer"]')).filter(visible)
      const panel = panels.find(el => text(el).includes(task.category))
      if (!panel) throw new Error('최종 발행 설정을 확인하지 못했습니다.')
      const publishButtons = Array.from(panel.querySelectorAll('button')).filter(el => visible(el) && text(el) === '발행')
      if (publishButtons.length !== 1) throw new Error('최종 발행 버튼을 확인하지 못했습니다.')
      publishButtons[0].click()
      const url = await waitFor(() => {
        const u = new URL(location.href)
        return u.pathname.startsWith(`/${task.blogId}/`) && /\/\d+$/.test(u.pathname) ? u.href : null
      }, 25000)
      return { status: 'published', publishedUrl: url, draftProof: proof }
    } catch (error) { return { status: 'needs_review', error: error.message } }
  }
  globalThis.artroNaver = { isEditor: () => !!titleNode() && !!bodyNode(), run }
})()
