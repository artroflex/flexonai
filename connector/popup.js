const fields = ['origin', 'token', 'blogId', 'enabled']
const status = document.getElementById('status')
async function load() {
  const config = await chrome.storage.local.get([...fields, 'lastStatus'])
  for (const key of fields) if (config[key] !== undefined) document.getElementById(key)[key === 'enabled' ? 'checked' : 'value'] = config[key]
  status.textContent = config.lastStatus || '플랫폼에서 연결 코드를 발급받아 입력하세요.'
}
document.getElementById('save').addEventListener('click', async () => {
  try {
    const config = Object.fromEntries(fields.map(key => [key, document.getElementById(key)[key === 'enabled' ? 'checked' : 'value']]))
    if (config.origin !== 'https://artroblog.vercel.app' || !/^artro\.[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(config.token) || !/^[a-zA-Z0-9_-]{3,50}$/.test(config.blogId)) throw new Error('연결 코드와 블로그 ID를 확인해 주세요.')
    await chrome.storage.local.set(config)
    const result = await chrome.runtime.sendMessage({ action: 'ping' })
    if (!result.ok) throw new Error(result.error)
    status.textContent = '연결 완료. PC 크롬에서 네이버에 로그인해 주세요.'
  } catch (error) { status.textContent = error.message }
})
document.getElementById('poll').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ action: 'poll' })
  status.textContent = result.error || result.message || '확인했습니다.'
})
load()

document.getElementById('commentsRetry').addEventListener('click', async () => { const result = await chrome.runtime.sendMessage({ action: 'comments-retry' }); status.textContent = result.error || result.message || '댓글 확인을 요청했습니다.' });
