'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_SETTINGS, type AutomationJob, type AutomationSettings } from '@/lib/automation/rules'

type Settings = Omit<AutomationSettings, 'tokenHash'> & { connected?: boolean }
const labels: Record<string, string> = { generating: '글 생성 중', queued: 'PC 연결 대기', working: '네이버 입력 중', draft_saved: '임시저장 확인', published: '발행 완료', failed: '작업 종료', needs_review: '네이버 직접 확인 필요', skipped: '근거 부족·중복으로 건너뜀' }
export default function AutomationPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [token, setToken] = useState('')
  const [preview, setPreview] = useState<AutomationJob | null>(null)
  const [dirty, setDirty] = useState(false)
  const load = useCallback(async (keepSettings = false) => {
    const res = await fetch('/api/automation', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    if (!keepSettings) setSettings(data.settings)
    setJobs(data.jobs)
  }, [])
  useEffect(() => { const timer = setTimeout(() => { load().catch(e => setMessage(e.message)) }, 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => { const timer = setInterval(() => { load(true).catch(() => {}) }, 20000); return () => clearInterval(timer) }, [load])
  async function action(body: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/automation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.token) setToken(data.token)
      if (body.action === 'revoke') setToken('')
      await load(); setDirty(false)
      setMessage(data.job?.error || (body.action === 'generate' ? '테스트 글을 생성했습니다. PC 확장이 연결되면 임시저장을 시도합니다.' : '설정을 반영했습니다.'))
    } catch (e) { setMessage(e instanceof Error ? e.message : '요청 실패') } finally { setBusy(false) }
  }
  const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-blue-500'
  function change(values: Partial<Settings>) { setSettings(s => ({ ...s, ...values })); setDirty(true) }
  return <main className="mx-auto max-w-6xl px-5 py-10 md:px-10">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-widest text-blue-600">ARTROBLOG AUTOMATION</p><h1 className="mt-2 text-3xl font-extrabold text-slate-900">연예뉴스 자동화</h1><p className="mt-3 text-sm leading-6 text-slate-500">최신 뉴스 확인부터 네이버 임시저장까지. 검증을 마친 뒤 자동 발행을 켜세요.</p></div><a href={`https://blog.naver.com/${encodeURIComponent(settings.blogId)}`} target="_blank" rel="noreferrer" className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">네이버 블로그 ↗</a></div>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">{[['수집·생성', settings.enabled ? '하루 3건 · 09시 / 13시 / 18시' : '정기 생성 꺼짐'], ['네이버 처리', settings.mode === 'draft' ? '임시저장' : '자동 발행'], ['PC 연결', settings.workerLastSeenAt ? new Date(settings.workerLastSeenAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '아직 연결되지 않음']].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-sm font-bold text-slate-900">{value}</p></div>)}</div>
    {message && <div role="status" className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}
    <div className="grid items-start gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">1. 발행 설정</h2>
        <label className="block text-sm font-semibold">네이버 블로그 ID<input value={settings.blogId} onChange={e => change({ blogId: e.target.value, verifiedDraftAt: null, mode: 'draft' })} className={field}/></label>
        <label className="block text-sm font-semibold">네이버 카테고리 이름<input value={settings.category} onChange={e => change({ category: e.target.value, verifiedDraftAt: null, mode: 'draft' })} className={field}/><span className="mt-1 block text-xs font-normal text-slate-500">네이버에 만든 카테고리 이름과 정확히 일치해야 합니다.</span></label>
        <label className="block text-sm font-semibold">수집 주제<input value={settings.topic} onChange={e => change({ topic: e.target.value })} className={field}/></label>
        <label className="block text-sm font-semibold">글 생성 AI<select value={settings.provider} onChange={e => change({ provider: e.target.value as Settings['provider'] })} className={field}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="anthropic">Claude</option></select></label>
        <p className="text-xs text-slate-500"><Link href="/settings" className="text-blue-600 underline">API 키 등록</Link>에서 선택한 AI의 키를 저장하세요. 기본 AI는 OpenAI입니다. 사용량은 해당 AI 계정에 청구됩니다.</p>
        <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e => change({ enabled: e.target.checked })}/>매일 09시·13시·18시(KST), 각 1건 생성</label>
        <label className="block text-sm font-semibold">처리 방식<select value={settings.mode} onChange={e => { if (e.target.value === 'publish' && !confirm('이후 정기 생성되는 글을 네이버에 공개 발행합니다. 자동 발행을 켤까요?')) return; change({ mode: e.target.value as Settings['mode'] }) }} className={field}><option value="draft">임시저장 · 기본값</option><option value="publish" disabled={!settings.verifiedDraftAt}>자동 발행 · 임시저장 검증 후</option></select></label>
        <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => action({ action: 'save', settings })} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">설정 저장</button><button disabled={busy || dirty} onClick={() => action({ action: 'generate' })} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? '처리 중…' : '테스트 글 1건 생성'}</button></div>
        {dirty && <p className="text-xs text-amber-700">변경한 설정을 먼저 저장해 주세요.</p>}
        <p className="text-xs leading-5 text-slate-500">최근 24시간의 출처가 부족하거나 같은 주제를 이미 다뤘으면 건너뜁니다. 테스트 글은 항상 임시저장 모드입니다. 확인이 필요한 작업이 남으면 다음 작업을 멈춥니다.</p>
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">2. PC 크롬 연결</h2><p className="text-sm leading-6 text-slate-600">네이버 글쓰기 API가 없어 로그인된 PC 크롬이 작업을 처리합니다. 휴대폰 로그인만으로는 연결되지 않습니다. PC·크롬이 꺼져 있으면 대기합니다.</p>
        <a href="/downloads/artroblog-connector.zip" className="inline-block rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">크롬 연결 도구 ZIP 다운로드</a>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>압축을 풀고 <code>chrome://extensions</code>에서 개발자 모드를 켭니다.</li><li>‘압축해제된 확장 프로그램을 로드합니다’에서 압축을 푼 폴더를 선택합니다.</li><li>확장 아이콘을 열고 이 사이트 주소, 연결 코드, 블로그 ID를 입력합니다.</li><li>PC 크롬에서 네이버에 로그인한 후 연결 도구를 켭니다.</li></ol>
        <div className="flex gap-3"><button disabled={busy || dirty} onClick={() => action({ action: 'token' })} className="rounded-xl border px-4 py-2 text-sm font-bold">{settings.connected ? '연결 코드 재발급' : '연결 코드 발급'}</button>{settings.connected && <button disabled={busy} onClick={() => action({ action: 'revoke' })} className="rounded-xl border px-4 py-2 text-sm">연결 해제</button>}</div>
        {token && <div className="rounded-xl bg-slate-50 p-4"><p className="mb-2 text-xs text-slate-500">이 코드는 지금만 표시됩니다. 본인 PC 확장에만 입력하세요.</p><code className="block break-all text-xs">{token}</code><button onClick={() => navigator.clipboard.writeText(token).then(() => setMessage('연결 코드를 복사했습니다.')).catch(() => setMessage('직접 연결 코드를 복사해 주세요.'))} className="mt-3 text-sm font-bold text-blue-700">코드 복사</button></div>}
        <p className="text-xs leading-5 text-amber-800">첫 임시저장은 네이버 글쓰기 화면과 임시저장 목록에서 직접 확인하세요. 편집기 구조 변경·로그인 만료 시 작업을 중단하며 임의로 재발행하지 않습니다.</p>
      </section>
    </div>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">3. 작업 기록</h2><button onClick={() => load(dirty).catch(e => setMessage(e.message))} className="text-sm text-blue-700">새로고침</button></div>
      {!jobs.length && <p className="py-10 text-center text-sm text-slate-500">아직 작업이 없습니다. 설정을 저장하고 테스트 글을 만들어보세요.</p>}
      <div className="space-y-3">{jobs.map(job => <article key={job.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{labels[job.status]}</span><h3 className="mt-3 text-sm font-bold">{job.title || '새 연예뉴스 수집'}</h3><p className="mt-1 text-xs text-slate-500">{new Date(job.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {job.category} · {job.mode === 'draft' ? '임시저장' : '발행'}</p></div><div className="flex items-center gap-3">{job.contentHtml && <button onClick={() => setPreview(job)} className="text-sm text-blue-700">미리보기</button>}{job.publishedUrl && <a href={job.publishedUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-700">발행 글 ↗</a>}</div></div>{job.error && <p className="mt-3 text-sm text-amber-800">{job.error}</p>}{job.status === 'draft_saved' && <button disabled={busy || dirty} onClick={() => { if (confirm('네이버 임시저장 목록에서 이 글을 다시 열어 제목·본문·이미지·카테고리가 올바른지 확인했나요?')) action({ action: 'verify', id: job.id, confirmed: true }) }} className="mt-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-800">네이버에서 확인 완료</button>}{['queued', 'needs_review', 'generating'].includes(job.status) && <button disabled={busy} onClick={() => action({ action: 'cancel', id: job.id })} className="ml-3 mt-3 text-xs text-slate-500">작업 종료</button>}</article>)}</div>
    </section>
    {preview && <div role="dialog" aria-modal="true" aria-label="글 미리보기" className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-slate-900/60 p-4"><div className="my-auto w-full max-w-3xl rounded-2xl bg-white p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">{preview.title}</h2><button onClick={() => setPreview(null)} className="shrink-0 px-3">닫기</button></div><iframe title="생성 글 미리보기" sandbox="" srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{font:16px/1.9 sans-serif;color:#172554;padding:12px}img{max-width:100%}h2{margin-top:32px;font-size:21px}figcaption{font-size:12px;color:#64748b}a{color:#2563eb}</style></head><body>${preview.contentHtml}</body></html>`} className="h-[70vh] w-full border-0"/></div></div>}
  </main>
}
