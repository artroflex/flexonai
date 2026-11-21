import type { Metadata } from 'next'
import Link from 'next/link'
import PublishingWorkspace from '@/app/_components/PublishingWorkspace'

export const metadata: Metadata = { title: '자동발행 작업실 둘러보기', robots: { index: false, follow: true } }
export default function DemoPage() {
  return <div className="min-h-screen bg-[#fffaf5]"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b border-orange-100 px-4 py-5 sm:px-8"><Link href="/about" className="text-xl font-extrabold tracking-tight">artro<span className="text-orange-700">BLOG</span></Link><Link href="/auth?mode=signup" className="rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-bold text-orange-800">로그인 · 회원가입 ↗</Link></div><PublishingWorkspace demo/></div>
}
