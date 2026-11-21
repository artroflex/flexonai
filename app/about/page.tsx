import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_ORIGIN, SERVICE_FAQS, SITE_DESCRIPTION } from '@/lib/site'

export const metadata: Metadata = {
  title: '네이버 자동발행 · 맞춤 GEO 블로그 앱',
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/about' },
  robots: { index: true, follow: true },
  openGraph: { url: '/about', title: 'artroBLOG · 최신 뉴스부터 네이버 자동발행까지', description: SITE_DESCRIPTION, images: ['/artroblog-social.png'] },
}

const features = [
  { number: '01', title: '발견하다', label: 'TREND DISCOVERY', text: '뉴스·RSS·키워드에서 다음 콘텐츠의 실마리를 찾으세요. 선택한 주제의 자동화는 최근 24시간의 새로운 소식을 확인합니다.' },
  { number: '02', title: '명확하게 쓰다', label: 'GEO CONTENT', text: '핵심을 먼저 전하는 요약, 의미가 분명한 소제목, 확인 가능한 출처. 사람과 AI 검색이 내용을 이해하기 쉬운 구조로 작성합니다.' },
  { number: '03', title: '내 블로그에 발행하다', label: 'PUBLISHING WORKFLOW', text: 'PC 크롬 연결과 첫 임시저장 확인을 마친 뒤 자동발행을 시작하세요. 예약에 따라 생성된 글을 네이버에 공개하고 결과 링크를 기록합니다.' },
]

export default function AboutPage() {
  const schema = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': `${PUBLIC_ORIGIN}/about#website`, name: 'artroBLOG', url: `${PUBLIC_ORIGIN}/about`, inLanguage: 'ko-KR', description: SITE_DESCRIPTION },
    { '@type': 'SoftwareApplication', name: 'artroBLOG', url: `${PUBLIC_ORIGIN}/about`, applicationCategory: 'BusinessApplication', operatingSystem: 'Web browser', description: SITE_DESCRIPTION, featureList: ['트렌드 글감 수집', 'AI 블로그 초안 작성', '주제·말투·시간을 선택하는 자동발행', '네이버 PC 크롬 발행 연결'] },
    { '@type': 'FAQPage', mainEntity: SERVICE_FAQS.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
  ] }
  return <main className="min-h-screen bg-[#fffaf5] text-slate-900">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6"><Link href="/about" className="text-xl font-black tracking-tight">artro<span className="text-orange-700">BLOG</span><span className="ml-2 text-orange-500">●</span></Link><Link href="/auth" className="rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-bold text-orange-900">로그인 · 회원가입 ↗</Link></header>
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-10 md:grid-cols-[1.2fr_1fr] md:py-20">
      <div><p className="mb-5 text-xs font-bold tracking-[.2em] text-orange-800">YOUR NEXT CONTENT STARTS HERE</p><h1 className="text-4xl font-black leading-[1.2] tracking-tight sm:text-6xl">오늘의 트렌드를,<br /><span className="text-orange-700">내 블로그에 자동발행.</span></h1><p className="mt-6 max-w-lg text-base leading-8 text-slate-600">연예뉴스·스포츠·리빙 등 8개 주제와 4가지 말투를 고르고, 발행 시간을 직접 정하세요. 본인 AI 키와 PC 크롬을 한 번 설정하면, 하루 최대 3건을 예약한 일정에 맞춰 처리합니다.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/auth?mode=signup" className="brand-cta rounded-xl px-6 py-3.5 text-sm font-bold">내 블로그 자동발행 연결하기 →</Link><Link href="/demo" className="rounded-xl border border-orange-200 bg-white px-5 py-3.5 text-sm font-bold text-orange-900">가입 전 둘러보기 ↗</Link></div><p className="mt-4 text-xs leading-6 text-slate-500">AI 생성에는 본인 API 키가 필요합니다. 네이버 전송은 로그인된 PC 크롬에서 실행됩니다.</p></div>
      <div className="relative rounded-[28px] border border-orange-200 bg-gradient-to-br from-orange-100 to-amber-50 p-5 sm:p-8"><div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-[0_20px_60px_-30px_#9a3412]"><div className="mb-6 flex items-center justify-between border-b border-orange-100 pb-4"><span className="text-xs font-extrabold tracking-widest text-orange-800">THE CONTENT NOTE</span><span className="text-xs text-slate-500">작성 구조 예시</span></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">명확한 답변 · 검토 가능한 근거</span><h2 className="mt-5 text-2xl font-black leading-snug">좋은 콘텐츠는<br />핵심이 먼저 보입니다.</h2><p className="mt-4 text-sm leading-7 text-slate-600">무엇이 달라졌는지 먼저 요약하고, 궁금한 점을 소제목으로 정리하세요. 사실을 확인할 수 있는 원문도 함께 남깁니다.</p><div className="mt-6 space-y-3">{['핵심을 전하는 첫 문단', '질문에 바로 답하는 본문', '맥락을 확인할 수 있는 출처'].map((text, i) => <div key={text} className="flex gap-3 rounded-xl bg-[#fffaf5] p-3 text-sm"><span className="font-bold text-orange-700">0{i+1}</span>{text}</div>)}</div></div></div>
    </section>
    <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-12"><p className="text-xs font-bold tracking-widest text-orange-800">LESS FRICTION. MORE CONTENT.</p><h2 className="mt-3 text-3xl font-black tracking-tight">뉴스가 발행되는 흐름</h2><div className="mt-8 grid gap-5 md:grid-cols-3">{features.map(item => <article key={item.number} className="rounded-2xl border border-orange-100 bg-white p-6"><p className="text-xs font-bold tracking-widest text-orange-800">{item.number} / {item.label}</p><h3 className="mt-5 text-xl font-bold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p></article>)}</div></section>
    <section className="mx-auto max-w-6xl px-6 py-12"><div className="rounded-3xl bg-[#2f211b] p-7 text-white sm:p-10"><p className="text-xs font-bold tracking-widest text-orange-300">GEO, WITH CONTEXT</p><h2 className="mt-4 text-2xl font-bold sm:text-3xl">AI 검색에도, 읽는 사람에게도 명확하게.</h2><p className="mt-4 max-w-3xl text-sm leading-8 text-orange-100/90">GEO는 키워드를 반복하는 작업이 아닙니다. 누가 무엇을 발표했는지, 언제의 정보인지, 어떤 근거로 설명하는지를 분명히 전달하는 것이 출발점입니다. 첫 연결에서는 임시저장으로 동작을 검증하고, 운영 중에는 발행 기록과 원문으로 내용을 확인하세요.</p><p className="mt-5 text-xs leading-6 text-orange-200/80">검색 노출과 AI 인용은 각 서비스가 결정합니다. 구조화 데이터나 특정 문구만으로 노출을 보장하지 않습니다.</p></div></section>
    <section className="mx-auto max-w-6xl px-6 py-12"><p className="text-xs font-bold tracking-widest text-orange-800">A FEW GOOD QUESTIONS</p><h2 className="mb-8 mt-3 text-3xl font-black">시작하기 전, 궁금한 것들</h2><div className="grid gap-4 md:grid-cols-2">{SERVICE_FAQS.map(item => <article key={item.question} className="rounded-2xl border border-orange-100 bg-white p-6"><h3 className="text-base font-bold">{item.question}</h3><p className="mt-3 text-sm leading-7 text-slate-600">{item.answer}</p></article>)}</div></section>
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-orange-200 px-6 py-8 text-xs text-slate-500"><span>artroBLOG · 뉴스에서 네이버 자동발행까지</span><div className="flex gap-5"><Link href="/privacy">개인정보 처리방침</Link><Link href="/auth">자동발행 앱 열기 ↗</Link></div></footer>
  </main>
}
