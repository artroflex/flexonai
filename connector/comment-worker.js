export async function pollComments(c, api) {
  const state = await chrome.storage.local.get(['commentActive', 'commentLastScan', 'commentError'])
  if (state.commentActive) {
    await api(c, { action: 'comment_result', blogId: c.blogId, ...state.commentActive, confirmed: false }).catch(() => {})
    await chrome.storage.local.remove(['commentActive'])
    return { message: '이전 답글 결과를 직접 확인해 주세요. 중복 등록은 하지 않습니다.' }
  }
  if (state.commentError) return { message: `댓글 확인 중단: ${state.commentError}` }
  if (Date.now() - (state.commentLastScan || 0) < 10 * 60000) return { message: '대기 작업 없음 · 댓글은 10분 간격으로 확인합니다.' }
  await chrome.storage.local.set({ commentLastScan: Date.now() })
  const plan = await api(c, { action: 'comment_plan', blogId: c.blogId })
  if (!plan.enabled) return { message: '대기 작업 없음 · 댓글 자동응답 꺼짐' }
  if (!plan.remaining) return { message: '오늘 댓글 자동응답 한도에 도달했습니다.' }
  let sent = 0
  for (const postUrl of plan.posts) {
    const u = new URL(postUrl)
    if (u.hostname !== 'blog.naver.com' || (u.pathname.split('/')[1] !== c.blogId && u.searchParams.get('blogId') !== c.blogId)) throw new Error('본인 블로그 글만 확인할 수 있습니다.')
    const tab = await chrome.tabs.create({ url: postUrl, active: false })
    let keep = false
    try {
      const until = Date.now() + 30000
      while (Date.now() < until) { const t = await chrome.tabs.get(tab.id); if (t.status === 'complete') break; await new Promise(r => setTimeout(r, 400)) }
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['comments.js'] })
      const discovery = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => !!globalThis.artroComments?.isPost() })
      const frames = discovery.filter(f => f.result === true)
      if (frames.length !== 1) throw new Error('댓글을 확인할 본문 화면을 하나로 찾지 못했습니다.')
      const target = { tabId: tab.id, frameIds: [frames[0].frameId] }
      const scan = (await chrome.scripting.executeScript({ target, func: (blogId, since) => globalThis.artroComments.scan(blogId, since), args: [c.blogId, plan.since] }))[0]?.result
      if (!scan?.candidates) throw new Error('댓글 조회 결과가 없습니다.')
      for (const comment of scan.candidates) {
        const prepared = await api(c, { action: 'comment_prepare', blogId: c.blogId, postUrl, ...comment, postText: scan.postText })
        if (!prepared.task) continue
        const task = prepared.task, active = { id: task.id, runId: task.runId }
        await chrome.storage.local.set({ commentActive: active })
        const commit = await api(c, { action: 'comment_commit', blogId: c.blogId, ...active })
        if (!commit.ok) { await chrome.storage.local.remove(['commentActive']); continue }
        let confirmed = false
        try {
          const result = (await chrome.scripting.executeScript({ target, func: (blogId, id, original, reply) => globalThis.artroComments.reply(blogId, id, original, reply), args: [c.blogId, comment.commentId, comment.text, task.reply] }))[0]?.result
          confirmed = result?.confirmed === true
        } finally {
          keep = !confirmed
          await api(c, { action: 'comment_result', blogId: c.blogId, ...active, confirmed })
          await chrome.storage.local.remove(['commentActive'])
        }
        if (!confirmed) throw new Error('답글 등록 결과를 확인하지 못했습니다. 열린 네이버 탭을 확인해 주세요.')
        sent++
        if (sent >= Math.min(3, plan.remaining)) return { message: `댓글 답글 ${sent}건 등록 확인` }
      }
    } catch (error) {
      keep = true
      await chrome.storage.local.set({ commentError: error.message })
      throw error
    } finally { if (!keep) await chrome.tabs.remove(tab.id) }
  }
  return { message: `댓글 확인 완료 · 답글 ${sent}건 · 광고·비밀·기존 댓글 제외` }
}
