import { pollComments } from './comment-worker.js'
let polling = false
const API_ORIGIN = 'https://artroblog.vercel.app'
async function config() {
  const c = await chrome.storage.local.get(['origin', 'token', 'blogId', 'enabled'])
  if (c.origin !== API_ORIGIN || !c.token || !c.blogId) throw new Error('확장 아이콘에서 연결 설정을 저장해 주세요.')
  return c
}
async function api(c, body) {
  const res = await fetch(`${API_ORIGIN}/api/automation/worker`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` }, body: JSON.stringify({ ...body, capabilities: ['interleaved-images-v1', 'rich-text-v1', 'comment-replies-v1'] }), signal: AbortSignal.timeout(45000) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `서버 오류 ${res.status}`)
  return data
}
async function setStatus(text) { await chrome.storage.local.set({ lastStatus: `${new Date().toLocaleString('ko-KR')}\n${text}` }) }
async function report(c, pending) {
  await api(c, { action: 'result', ...pending })
  await chrome.storage.local.remove(['active', 'pendingResult'])
}
async function poll() {
  if (polling) return { message: '작업을 확인 중입니다.' }
  polling = true
  try {
    const c = await config()
    const state = await chrome.storage.local.get(['active', 'pendingResult'])
    if (state.pendingResult) { await report(c, state.pendingResult); return { message: '이전 결과 보고를 완료했습니다.' } }
    if (state.active) {
      // A restarted service worker cannot know whether a click saved/published a post.
      // Never reclaim or replay it. Report uncertainty and leave the Naver tab open.
      const pending = { ...state.active, status: 'needs_review', error: '크롬 작업기가 중단됐습니다. 열린 네이버 탭과 임시저장 목록을 확인해 주세요.' }
      await chrome.storage.local.set({ pendingResult: pending }); await report(c, pending)
      return { message: pending.error }
    }
    if (!c.enabled) { await api(c, { action: 'ping' }); return { message: '연결됨 · 자동 처리 꺼짐' } }
    const { task } = await api(c, { action: 'claim', blogId: c.blogId })
    if (!task) { const result = await pollComments(c, api); await setStatus(result.message); return result }
    const active = { id: task.id, runId: task.runId }
    await chrome.storage.local.set({ active })
    await setStatus(`입력 시작: ${task.title}`)
    let result
    try {
      // Every task gets a NEW editor tab: never overwrite an existing editor or user's draft.
      const tab = await chrome.tabs.create({ url: `https://blog.naver.com/${encodeURIComponent(task.blogId)}?Redirect=Write&categoryNo=0`, active: true })
      const until = Date.now() + 45000
      while (Date.now() < until) {
        const t = await chrome.tabs.get(tab.id)
        if (t.status === 'complete') break
        await new Promise(r => setTimeout(r, 600))
      }
      const loaded = await chrome.tabs.get(tab.id)
      if (!loaded.url?.startsWith('https://blog.naver.com/')) throw new Error('네이버 로그인이 필요합니다. 로그인 후 새 테스트를 진행하세요.')
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['naver.js'] })
      const imageUrls = task.imageUrls?.length ? task.imageUrls : task.imageUrl ? [task.imageUrl] : []
      if (imageUrls.length > 5 || new Set(imageUrls).size !== imageUrls.length) throw new Error('이미지 목록을 확인하지 못했습니다.')
      const images = []
      let totalImageBytes = 0
      for (const imageUrl of imageUrls) {
        const url = new URL(imageUrl)
        if (!url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith('/storage/v1/object/public/post-images/')) throw new Error('이미지 저장소 주소가 올바르지 않습니다.')
        const response = await fetch(url.href, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error('뉴스 이미지를 내려받지 못했습니다.')
        const bytes = new Uint8Array(await response.arrayBuffer())
        totalImageBytes += bytes.length
        if (bytes.length > 5 * 1024 * 1024 || totalImageBytes > 20 * 1024 * 1024) throw new Error('뉴스 이미지 용량이 전송 한도를 넘었습니다.')
        let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384))
        images.push({ url: imageUrl, data: btoa(binary) })
      }
      // Frame discovery is read-only; precisely one matching editor is required.
      const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => !!globalThis.artroNaver?.isEditor() })
      const editors = frames.filter(f => f.result === true)
      if (editors.length !== 1) throw new Error('네이버 편집기를 하나로 확인하지 못했습니다. 로그인·새 글쓰기 화면을 확인하세요.')
      const heartbeat = setInterval(() => { api(c, { action: 'heartbeat', ...active }).catch(() => {}) }, 30000)
      try {
        const responses = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [editors[0].frameId] }, func: async (task, images) => globalThis.artroNaver.run(task, images), args: [task, images] })
        result = responses[0]?.result
        if (!result?.status) throw new Error('편집기에서 처리 결과를 반환하지 않았습니다.')
      } finally { clearInterval(heartbeat) }
    } catch (error) { result = { status: 'needs_review', error: error.message } }
    const pending = { ...active, ...result }
    await chrome.storage.local.set({ pendingResult: pending })
    await report(c, pending)
    await setStatus(result.status === 'draft_saved' ? '임시저장 확인. 네이버에서 글을 검토해 주세요.' : result.status === 'published' ? `발행 확인: ${result.publishedUrl}` : result.error || result.status)
    return { message: result.error || result.status }
  } catch (error) { await setStatus(error.message); return { error: error.message } }
  finally { polling = false }
}
async function ensureAlarm() { if (!(await chrome.alarms.get('artro-poll'))) await chrome.alarms.create('artro-poll', { periodInMinutes: 1 }) }
chrome.runtime.onInstalled.addListener(ensureAlarm)
chrome.runtime.onStartup.addListener(ensureAlarm)
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'artro-poll') poll() })
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab) return false
  if (message.action === 'ping') { config().then(c => api(c, { action: 'ping' })).then(data => respond(data)).catch(e => respond({ ok: false, error: e.message })); return true }
  if (message.action === 'poll') { poll().then(respond); return true }
  if (message.action === 'comments-retry') { chrome.storage.local.remove(['commentError', 'commentLastScan']).then(() => poll()).then(respond); return true }
  return false
})
ensureAlarm()
