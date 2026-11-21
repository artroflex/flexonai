'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { bodyLengthAccepted } from '@/lib/automation/article'
import { scheduleLabel, SUBJECT_PRESETS, TONE_PRESETS, DEFAULT_SETTINGS, NEWS_TOPIC_PRESETS, kstDate, pcRecentlySeen, publishingBlockers, type AutomationJob, type AutomationSettings } from '@/lib/automation/rules'

type Settings = Omit<AutomationSettings, 'tokenHash'> & { connected?: boolean }
const labels: Record<string, string> = { generating: '뉴스·GEO 글 생성 중', queued: '네이버 전송 대기', working: '네이버 처리 중', draft_saved: '첫 연결 임시저장 완료', published: '공개 발행 완료', failed: '작업 종료', needs_review: '네이버 결과 확인 필요', skipped: '새로운 근거 부족 · 건너뜀' }
const field = 'mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:outline-orange-600'

export default function PublishingWorkspace() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [jobs, setJobs] = useState<AutomationJob[]>([])
  const [providers, setProviders] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [checkedAt, setCheckedAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [token, setToken] = useState('')
  const [preview, setPreview] = useState<AutomationJob | null>(null)
  const load = useCallback(async (keepSettings = false) => {
    const res = await fetch('/api/automation', { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    if (!keepSettings) setSettings(data.settings)
    else setSettings(previous => ({ ...previous, workerLastSeenAt: data.settings.workerLastSeenAt, connected: data.settings.connected }))
    setJobs(data.jobs); setProviders(data.configuredProviders || []); setCheckedAt(Date.now()); setLoaded(true)
  }, [])
  useEffect(() => { const timer = setTimeout(() => { load().catch(e => setMessage(e.message)) }, 0); return () => clearTimeout(timer) }, [load])
  useEffect(() => { const timer = setInterval(() => { load(dirty).catch(e => setMessage(e.message)) }, 20000); return () => clearInterval(timer) }, [load, dirty])
  async function action(body: Record<string, unknown>) {
    setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/automation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.token) setToken(data.token)
      if (body.action === 'revoke') setToken('')
      await load(); setDirty(false)
      const messages: Record<string, string> = { start: '자동발행 예약을 켰습니다. 이후 예약 시간에 생성하는 글을 네이버에 공개 발행합니다.', pause: '정기 생성과 대기 중인 예약 작업을 멈췄습니다. 이미 네이버에서 처리 중인 작업은 결과를 확인해 주세요.', generate: '첫 연결 시험 글을 생성했습니다. PC 연결 도구가 네이버 임시저장으로 전송합니다.', save: '발행 설정을 저장했습니다.', verify: '첫 연결 확인을 마쳤습니다. 자동발행 시작을 눌러 주세요.' }
      setMessage(data.job?.error || messages[String(body.action)] || '설정을 반영했습니다.')
    } catch (e) { setMessage(e instanceof Error ? e.message : '요청 실패') } finally { setBusy(false) }
  }
  function change(values: Partial<Settings>) { setSettings(s => ({ ...s, ...values })); setDirty(true) }
  const keyRegistered = providers.includes(settings.provider)
  const pcOnline = pcRecentlySeen(settings.workerLastSeenAt, checkedAt)
  const blockers = publishingBlockers({ ...settings, tokenHash: settings.connected ? 'registered' : null }, keyRegistered, checkedAt, providers.includes('openai'))
  const needsReview = jobs.some(job => job.status === 'needs_review')
  const running = settings.enabled && settings.mode === 'publish'
  const draftVerified = !!settings.verifiedDraftAt && settings.verifiedContentVersion === 2 && settings.verifiedImageCount === (settings.imageCount ?? 5)
  const ready = loaded && blockers.length === 0 && !needsReview && !dirty
  const headline = !loaded ? '발행 상태를 확인하고 있어요' : needsReview ? '네이버에서 결과를 확인해 주세요' : running && ready ? '자동발행 예약이 켜져 있어요' : ready ? '자동발행을 시작할 준비가 됐어요' : '자동발행 연결을 마무리하세요'
  const setupSteps = [
    { title: '내 블로그 설정', done: !!settings.blogId && !dirty, detail: '블로그 ID와 카테고리 저장', href: '#publishing-settings' },
    { title: 'AI 키 등록', done: keyRegistered, detail: `${settings.provider === 'openai' ? 'OpenAI' : settings.provider === 'gemini' ? 'Gemini' : 'Claude'} 키 등록 상태`, href: '/settings' },
    { title: 'PC 크롬 연결', done: !!settings.connected && pcOnline, detail: '확장 자동처리 켜기 · 최근 응답 확인', href: '#pc-connection' },
    { title: '첫 발행 연결 시험', done: draftVerified, detail: '임시저장 1건 확인 후 자동발행 시작', href: '#connection-test' },
  ]
  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
    <section className="studio-hero mb-6 p-6 sm:p-9">
      <div className="relative z-10"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-extrabold tracking-[.16em] text-orange-800">ARTROBLOG · AUTO PUBLISH</p><span className="rounded-full border border-orange-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-orange-900">하루 최대 3건 · 네이버 블로그</span></div>
        <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-4xl">뉴스를 발견하고,<br /><span className="text-orange-700">내 블로그에 자동발행.</span></h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">연예뉴스부터 스포츠·리빙까지, 내 주제와 말투로 작성하고 원하는 시간에 발행하세요. 본문 1,500~2,000자, 이미지 4~5장, 빨간 소제목과 실제 발언 인용구를 모바일에 맞는 짧은 문단으로 구성합니다.</p>
        <div className="mt-6 rounded-2xl border border-orange-200 bg-white/85 p-5"><p className="text-xs font-bold text-orange-800">현재 운영 상태</p><h2 className="mt-2 text-lg font-bold">{headline}</h2>
          {loaded && blockers.length > 0 && <ul className="mt-3 space-y-1.5 text-sm leading-6 text-slate-600">{blockers.map(reason => <li key={reason}>• {reason}</li>)}</ul>}
          {needsReview && <p className="mt-3 text-sm text-amber-800">결과가 불확실한 글이 있어 다음 작업을 보류합니다. 아래 발행 기록을 확인하세요.</p>}
          <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy || !ready || running} onClick={() => action({ action: 'start' })} className="brand-cta rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">{busy ? '처리 중…' : running ? '자동발행 예약 켜짐' : '자동발행 시작'}</button><button disabled={busy || !loaded || !settings.enabled} onClick={() => action({ action: 'pause' })} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold disabled:opacity-40">일시정지</button><Link href="/my-posts" className="rounded-xl px-3 py-3 text-sm font-bold text-orange-800">생성한 글 보관함 ↗</Link></div>
          <p className="mt-3 text-xs leading-6 text-slate-500">자동발행 시작은 이후 예약글에 적용됩니다. 첫 연결 시험과 이미 생성된 임시저장 글은 자동으로 공개 전환하지 않습니다.</p>
        </div>
      </div>
    </section>
    {message && <div role="status" className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-900">{message}</div>}
    <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="발행 현황">{[
      ['발행 일정', scheduleLabel(settings.publishHours), dirty ? '저장 전 변경사항 · 한국 시간' : '한국 시간 · 매회 1건'],
      ['오늘 공개 발행', `${jobs.filter(j => j.status === 'published' && kstDate(new Date(j.updatedAt)) === kstDate(new Date(checkedAt))).length}건`, '확인된 네이버 발행 결과'],
      ['전송 대기', `${jobs.filter(j => j.status === 'queued').length}건`, 'PC 연결 후 순서대로 처리'],
      ['PC 응답 상태', pcOnline ? '최근 응답 있음' : '연결 확인 필요', 'PC·크롬·네이버 로그인 유지'],
    ].map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-base font-bold sm:text-lg">{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></div>)}</section>
    <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="자동발행 연결 순서">{setupSteps.map((step, i) => <Link key={step.title} href={step.href} className="flex gap-3 rounded-2xl border border-orange-100 bg-white p-4 hover:border-orange-300"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-orange-700 text-white' : 'bg-orange-50 text-orange-800'}`}>{step.done ? '✓' : i+1}</span><div><h2 className="text-sm font-bold">{step.title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{step.detail}</p></div></Link>)}</section>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section id="publishing-settings" className="scroll-mt-20 space-y-5 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">발행할 블로그와 콘텐츠</h2>
        <label className="block text-sm font-semibold">내 네이버 블로그 ID<input placeholder="예: my_blog_id" value={settings.blogId} onChange={e => change({ blogId: e.target.value, verifiedDraftAt: null, mode: 'draft' })} className={field}/></label>
        <label className="block text-sm font-semibold">네이버 카테고리 이름<input value={settings.category} onChange={e => change({ category: e.target.value, verifiedDraftAt: null, mode: 'draft' })} className={field}/><span className="mt-1 block text-xs font-normal text-slate-500">네이버에 만든 카테고리 이름과 같아야 합니다.</span></label>
        <label className="block text-sm font-semibold">블로그 주제<select value={settings.subject ?? 'entertainment'} onChange={e => {
          const preset = SUBJECT_PRESETS.find(s => s.id === e.target.value)!
          change({ subject: preset.id, topic: preset.query })
        }} className={field}>{SUBJECT_PRESETS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <p className="text-xs leading-6 text-slate-500">주제에 맞는 최신 소식과 글 구성을 적용합니다. 네이버 카테고리는 위에 입력한 이름으로 유지하므로, 주제를 바꾸면 카테고리도 확인해 주세요.</p>
        <label className="block text-sm font-semibold">세부 수집 키워드<input value={settings.topic} onChange={e => change({ topic: e.target.value })} className={field}/></label>
        {(settings.subject ?? 'entertainment') === 'entertainment' && <div className="flex flex-wrap gap-2">{NEWS_TOPIC_PRESETS.map(preset => <button key={preset.label} type="button" onClick={() => change({ topic: preset.topic })} className={`rounded-full border px-3 py-2 text-xs font-semibold ${settings.topic === preset.topic ? 'border-orange-300 bg-orange-100 text-orange-900' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'}`}>{preset.label}</button>)}</div>}
        <label className="block text-sm font-semibold">글의 말투<select value={settings.tone ?? 'natural'} onChange={e => change({ tone: e.target.value })} className={field}>{TONE_PRESETS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <fieldset className="rounded-xl border border-orange-100 bg-orange-50/40 p-4"><legend className="px-1 text-sm font-bold">발행 시간 · 한국 시간</legend><p className="text-xs leading-6 text-slate-600">하루 1~3회, 정시 단위로 선택하세요. 같은 시간은 한 번만 선택할 수 있습니다.</p>
          <label className="mt-3 block text-sm font-semibold">하루 발행 횟수<select className={field} value={(settings.publishHours ?? [7, 9, 19]).length} onChange={e => {
            const count = Number(e.target.value), hours = [...(settings.publishHours ?? [7, 9, 19])]
            for (const hour of [7, 9, 19, ...Array.from({ length: 24 }, (_, i) => i)]) if (hours.length < count && !hours.includes(hour)) hours.push(hour)
            change({ publishHours: hours.slice(0, count) })
          }}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}회</option>)}</select></label>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">{(settings.publishHours ?? [7, 9, 19]).map((hour, index, hours) => <label key={index} className="block text-xs font-semibold">{index + 1}번째 발행<select className={field} value={hour} onChange={e => change({ publishHours: hours.map((h, i) => i === index ? Number(e.target.value) : h) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h} disabled={h !== hour && hours.includes(h)}>{h < 12 ? '오전' : '오후'} {h % 12 || 12}시 ({String(h).padStart(2, '0')}:00)</option>)}</select></label>)}</div>
          <p className="mt-3 text-xs leading-6 text-slate-500">저장한 이후 생성되는 예약글부터 적용합니다. 서버 처리와 PC 연결 상태에 따라 실제 발행이 늦어질 수 있습니다.</p>
        </fieldset>
        <p className="text-xs leading-6 text-slate-500">주제·말투·시간은 로그인한 내 계정에만 저장됩니다. 각 사용자가 본인 API 키와 네이버 블로그를 연결합니다. 홈 추천 노출이나 수익은 보장하지 않습니다.</p>
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-4"><h3 className="text-base font-bold text-[#C62828]">모바일에 맞춘 기본 글 형식</h3><p className="mt-2 text-xs leading-6 text-slate-600">본문 19 · 빨간 소제목 24 · 짧은 문장과 문단 · 확인된 발언 인용구 · 이미지 4~5장 · 해시태그 다음 출처. 사진 설명과 출처는 11 크기, 줄간격 120%로 작고 촘촘하게 표시합니다. 실제 발언이 없으면 인용구를 만들지 않습니다.</p></div>
        <label className="block text-sm font-semibold">글을 작성할 AI<select value={settings.provider} onChange={e => change({ provider: e.target.value as Settings['provider'] })} className={field}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="anthropic">Claude</option></select></label>
        <label className="block text-sm font-semibold">글에 넣을 실제 사진<select value={settings.imageCount ?? 5} onChange={e => change({ imageCount: Number(e.target.value) as 4 | 5, verifiedDraftAt: null, mode: 'draft' })} className={field}><option value={5}>5장 · 대표 사진 1장 + 본문 4장 (기본)</option><option value={4}>4장 · 대표 사진 1장 + 본문 3장</option></select></label>
        <p className="text-xs leading-6 text-slate-500">본문은 공백 포함 1,500~2,000자로 검사합니다. 제목·출처·이미지 설명은 제외하며 부족한 사실을 지어내 분량을 채우지 않습니다. 이미지는 Wikimedia Commons에서 상업적 재사용 조건과 촬영 정보를 확인한 실제 자료사진만 찾습니다. 사진별 원본·촬영자·라이선스를 글 끝에 정리하며, AI 이미지로 대체하지 않습니다. 적합한 사진 4~5장을 확보하지 못하면 발행을 보류합니다.</p>
        <p className="text-xs leading-6 text-slate-500"><Link href="/settings" className="font-bold text-orange-800 underline">API 키 등록</Link> · {keyRegistered ? '선택한 AI의 키가 등록되어 있습니다.' : '선택한 AI의 키를 등록해 주세요.'} 사용료는 본인 AI 계정에 청구됩니다.</p>
        <button disabled={busy || !loaded} onClick={() => action({ action: 'save', settings })} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-40">발행 설정 저장</button>
        {dirty && <p className="text-xs text-amber-800">변경 내용을 저장한 뒤 연결 시험이나 자동발행을 시작해 주세요.</p>}
        <p className="text-xs leading-6 text-slate-500">최근 24시간의 출처를 확인합니다. 정보가 부족하거나 중복된 소식은 건너뛰며 스케줄러에 따라 실행 시각이 달라질 수 있습니다.</p>
      </section>
      <section id="pc-connection" className="scroll-mt-20 space-y-4 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold">네이버 자동발행 연결</h2><p className="text-sm leading-7 text-slate-600">연결 도구가 제목·본문·표지·카테고리를 입력하고 발행 결과를 앱에 돌려줍니다. 본문을 직접 복사할 필요가 없습니다. 이미지 여러 장을 전송하려면 연결 도구 v1.2.0 이상을 설치하세요.</p>
        <a href="/downloads/artroblog-connector.zip" className="inline-block rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-orange-800">PC 크롬 연결 도구 다운로드 ↓</a>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-600"><li>압축을 풀고 <code>chrome://extensions</code>에서 개발자 모드를 켭니다.</li><li>‘압축해제된 확장 프로그램을 로드합니다’에서 해당 폴더를 선택합니다.</li><li>확장에 사이트 주소·아래 연결 코드·내 블로그 ID를 저장합니다.</li><li>PC 크롬에서 네이버에 로그인하고 확장의 자동처리를 켭니다.</li></ol>
        <div className="flex flex-wrap gap-3"><button disabled={busy || dirty || !loaded || !settings.blogId} onClick={() => action({ action: 'token' })} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40">{settings.connected ? '연결 코드 재발급' : '연결 코드 발급'}</button>{settings.connected && <button disabled={busy} onClick={() => action({ action: 'revoke' })} className="rounded-xl border px-4 py-2 text-sm">연결 해제</button>}</div>
        {token && <div className="rounded-xl bg-slate-50 p-4"><p className="mb-2 text-xs text-slate-500">본인 PC 확장에 입력할 연결 코드입니다. 지금만 표시됩니다.</p><code className="block break-all text-xs">{token}</code><button onClick={() => navigator.clipboard.writeText(token).then(() => setMessage('연결 코드를 복사했습니다.')).catch(() => setMessage('연결 코드를 직접 선택해 복사해 주세요.'))} className="mt-3 text-sm font-bold text-orange-800">연결 코드 복사</button></div>}
        <p className="rounded-xl bg-orange-50 p-3 text-xs leading-6 text-orange-900">네이버 전송 중에는 PC·크롬을 켜고 네이버 로그인을 유지하세요. 절전 상태나 로그인 만료 시에는 전송되지 않습니다. PC 응답만으로 네이버 로그인·발행 성공을 보장하지는 않습니다.</p>
      </section>
    </div>
    <section id="connection-test" className="mt-6 scroll-mt-20 rounded-2xl border border-orange-200 bg-white p-6"><h2 className="text-lg font-bold">처음 한 번, 발행 연결 시험</h2><p className="mt-3 text-sm leading-7 text-slate-600">시험 글을 네이버에 임시저장합니다. 네이버 임시저장 목록에서 제목·본문·이미지·카테고리를 확인하고 아래 기록의 ‘네이버에서 확인 완료’를 누르세요. 이후 위의 ‘자동발행 시작’을 켜면 예약글은 공개 발행됩니다.</p><button disabled={busy || !loaded || dirty || !keyRegistered || !settings.blogId || jobs.some(j => ['queued', 'generating', 'working', 'needs_review'].includes(j.status))} onClick={() => action({ action: 'generate' })} className="mt-4 rounded-xl border border-orange-300 bg-orange-50 px-5 py-3 text-sm font-bold text-orange-900 disabled:opacity-40">{busy ? '처리 중…' : '네이버 연결 시험 글 1건 생성'}</button><p className="mt-3 text-xs leading-6 text-slate-500">시험 글은 공개하지 않습니다. 대기 중인 글이 있으면 새로 만들지 않고 기존 글의 전송 결과부터 확인합니다.</p></section>
    <section id="publishing-history" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">발행 기록</h2><button onClick={() => load(dirty).catch(e => setMessage(e.message))} className="text-sm font-semibold text-orange-800">새로고침</button></div>
      {!jobs.length && <p className="py-8 text-center text-sm text-slate-500">발행 기록이 없습니다. 첫 연결 시험부터 시작해 주세요.</p>}
      <div className="space-y-3">{jobs.map(job => <article key={job.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><span className={`rounded-full px-3 py-1 text-xs font-bold ${job.status === 'published' ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-900'}`}>{labels[job.status]}</span><h3 className="mt-3 text-sm font-bold">{job.title || '새 소식 수집'}</h3><p className="mt-1 text-xs leading-6 text-slate-500">{new Date(job.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {job.category} · {job.mode === 'draft' ? '임시저장' : '공개 발행'}{job.bodyCharCount ? ` · 본문 ${job.bodyCharCount.toLocaleString()}자` : ''}{job.imageUrls?.length ? ` · 이미지 ${job.imageUrls.length}장` : ''}</p></div><div className="flex items-center gap-3">{job.contentHtml && <button onClick={() => setPreview(job)} className="text-sm text-orange-800">미리보기</button>}{job.publishedUrl && <a href={job.publishedUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-orange-800">발행된 글 보기 ↗</a>}</div></div>{job.error && <p className="mt-3 text-sm leading-6 text-amber-800">{job.error}</p>}{job.status === 'draft_saved' && bodyLengthAccepted(job.bodyCharCount ?? 0) && job.imageUrls?.length === (settings.imageCount ?? 5) && <button disabled={busy || dirty} onClick={() => { if (confirm('네이버 임시저장 목록에서 이 글의 제목·본문·이미지·카테고리가 올바른지 확인했나요?')) action({ action: 'verify', id: job.id, confirmed: true }) }} className="mt-3 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-bold text-emerald-800">네이버에서 확인 완료</button>}{job.status === 'draft_saved' && (!bodyLengthAccepted(job.bodyCharCount ?? 0) || job.imageUrls?.length !== (settings.imageCount ?? 5)) && <p className="mt-3 text-xs leading-6 text-amber-800">이전 작성 기준의 글입니다. 새 분량과 이미지 수로 연결 시험 글을 만들어 주세요.</p>}{['queued', 'needs_review', 'generating'].includes(job.status) && <button disabled={busy} onClick={() => action({ action: 'cancel', id: job.id })} className="ml-3 mt-3 text-xs text-slate-500">작업 종료</button>}</article>)}</div>
    </section>
    {preview && <div role="dialog" aria-modal="true" aria-label="글 미리보기" className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-slate-900/60 p-4"><div className="my-auto w-full max-w-3xl rounded-2xl bg-white p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">{preview.title}</h2><button onClick={() => setPreview(null)} className="shrink-0 px-3">닫기</button></div><iframe title="생성 글 미리보기" sandbox="" srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{font:16px/1.9 sans-serif;color:#2f211b;padding:12px}img{max-width:100%}h2{margin-top:32px;font-size:21px}figcaption{font-size:12px;color:#7a685e}a{color:#9a3412}</style></head><body>${preview.contentHtml}</body></html>`} className="h-[70vh] w-full border-0"/></div></div>}
  </main>
}
