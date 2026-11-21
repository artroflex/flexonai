// Uses only rendered Naver comment controls. Never calls a private Naver API.
(() => {
  if (globalThis.artroComments) return
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
  const value = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim()
  const info = el => el.getAttribute('data-info') || ''
  const idOf = el => /\bcommentNo:'(\d+)'/.exec(info(el))?.[1]
  const roots = () => Array.from(document.querySelectorAll('.u_cbox_comment')).filter(el => /\breplyLevel:1(?:,|$)/.test(info(el)))
  const wait = async probe => { const until = Date.now() + 12000; while (Date.now() < until) { const result = probe(); if (result) return result; await new Promise(r => setTimeout(r, 250)) } throw new Error('댓글 화면 확인 시간이 초과됐습니다.') }
  function owner(blogId) {
    const u = new URL(location.href)
    if (u.hostname !== 'blog.naver.com' || (u.searchParams.get('blogId') !== blogId && u.pathname.split('/')[1] !== blogId)) throw new Error('대상 블로그가 다릅니다.')
    if (!Array.from(document.querySelectorAll('a')).some(a => visible(a) && value(a) === '수정' && /suggestConvert|PostWrite|postwrite/.test(a.getAttribute('href') || ''))) throw new Error('블로그 주인으로 로그인했는지 확인하지 못했습니다.')
  }
  const ownReply = row => Array.from(row.querySelectorAll('.u_cbox_reply_area .u_cbox_comment')).some(el => /\b(?:mine|manager):true(?:,|$)/.test(info(el)))
  async function open(blogId) {
    owner(blogId)
    if (!visible(document.querySelector('.u_cbox_wrap'))) {
      const toggles = Array.from(document.querySelectorAll('[id^="Comi"]')).filter(visible)
      if (toggles.length !== 1) throw new Error('댓글 열기 버튼을 확인하지 못했습니다.')
      toggles[0].click()
    }
    await wait(() => visible(document.querySelector('.u_cbox_wrap')) && document.querySelector('.u_cbox_write_area'))
    // Only the currently displayed comments are handled. No hidden comment data.
    return true
  }
  async function scan(blogId, since) {
    await open(blogId)
    const rows = roots(), candidates = []
    for (const row of rows.slice(0, 50)) {
      const meta = info(row), id = idOf(row), createdAt = row.querySelector('.u_cbox_date')?.getAttribute('data-value')
      if (!id || !createdAt || Date.parse(createdAt) < Date.parse(since) || /\b(?:secret|mine|manager|deleted|blindReport):true(?:,|$)/.test(meta) || !/\bvisible:true(?:,|$)/.test(meta)) continue
      const text = value(row.querySelector('.u_cbox_contents'))
      // Keep private/contact/spam material on the PC, before any AI request.
      if (!text || text.length > 1000 || /https?:\/\/|www\.|@|\b0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}\b|\d{6}[- ]?[1-4]\d{6}|계좌|비밀|비밀번호|주소는|연락처|서로?이웃|맞방|답방|놀러\s*와|방문\s*해|홍보|광고|카톡|텔레그램|환불|결제|입금|수강료|신청|계약|견적|고소|소송|신고|저작권|초상권|불법|사기|표절|치료|진단|투자|매수|매도|자살|살해|혐오|씨발|병신|ignore|이전\s*지시|시스템\s*프롬프트|API\s*키|sk-[\w-]{15,}/i.test(text)) continue
      const toggle = Array.from(row.querySelectorAll('.u_cbox_btn_reply')).find(el => visible(el) && el.getAttribute('aria-expanded') === 'false')
      if (!toggle || value(toggle) !== '답글') continue
      if (toggle) toggle.click()
      await wait(() => row.querySelector('[contenteditable="true"][id*="__reply_textarea_"]'))
      if (ownReply(row) || row.querySelector('.u_cbox_reply_area .u_cbox_comment')) continue
      candidates.push({ commentId: id, text, createdAt })
    }
    const body = document.querySelector('.se-main-container')
    if (!body) throw new Error('본문 근거를 확인하지 못했습니다.')
    const postText = (body.innerText || '').split('\n').filter(line => !/@|https?:\/\/|\b0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}\b|sk-[\w-]{15,}/i.test(line)).join('\n').slice(0, 5000)
    return { candidates, postText }
  }
  async function reply(blogId, commentId, originalText, replyText) {
    owner(blogId)
    const row = roots().find(el => idOf(el) === commentId)
    if (!row || ownReply(row) || value(row.querySelector('.u_cbox_contents')) !== originalText) throw new Error('댓글이 바뀌었거나 이미 답글이 있습니다.')
    const input = row.querySelector('[contenteditable="true"][id*="__reply_textarea_"]')
    if (!input || !visible(input) || value(input)) throw new Error('답글 입력창이 비어 있는지 확인하지 못했습니다.')
    const secret = row.querySelector('.u_cbox_reply_area input[type="checkbox"]')
    if (secret?.checked) throw new Error('비밀댓글 설정이 있어 중단했습니다.')
    const buttons = Array.from(row.querySelectorAll('.u_cbox_reply_area .u_cbox_btn_upload')).filter(visible)
    if (buttons.length !== 1) throw new Error('이 댓글의 답글 등록 버튼을 확인하지 못했습니다.')
    input.focus()
    if (!document.execCommand('insertText', false, replyText)) throw new Error('답글을 입력하지 못했습니다.')
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: replyText }))
    if (value(input) !== replyText) throw new Error('답글 입력 결과가 다릅니다.')
    buttons[0].click()
    await wait(() => Array.from(row.querySelectorAll('.u_cbox_reply_area .u_cbox_comment')).some(el => /\b(?:mine|manager):true(?:,|$)/.test(info(el)) && value(el.querySelector('.u_cbox_contents')) === replyText))
    return { confirmed: true }
  }
  globalThis.artroComments = { scan, reply, isPost: () => !!document.querySelector('.se-main-container') && !document.querySelector('.se-title-text [contenteditable="true"]') }
})()
