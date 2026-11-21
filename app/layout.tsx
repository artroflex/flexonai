import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import BlogShell from './_components/BlogShell'

const sans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})

import { APP_TITLE } from '@/lib/deployment'
import { PUBLIC_ORIGIN, SITE_DESCRIPTION } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_ORIGIN),
  title: { default: `${APP_TITLE} | 연예뉴스 GEO 글쓰기 · 네이버 자동발행`, template: `%s | ${APP_TITLE}` },
  description: SITE_DESCRIPTION,
  applicationName: APP_TITLE,
  robots: { index: false, follow: true },
  openGraph: { type: 'website', locale: 'ko_KR', siteName: APP_TITLE, title: `${APP_TITLE} · 연예뉴스 GEO 글쓰기 · 네이버 자동발행`, description: SITE_DESCRIPTION, images: [{ url: '/artroblog-social.png', width: 1200, height: 630, alt: 'artroBLOG · Trend to content' }] },
  twitter: { card: 'summary_large_image', title: `${APP_TITLE} · 연예뉴스 GEO 글쓰기 · 네이버 자동발행`, description: SITE_DESCRIPTION, images: ['/artroblog-social.png'] },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className={`${sans.variable} ${sans.className}`}>
        <BlogShell>{children}</BlogShell>
      </body>
    </html>
  )
}
