import type { MetadataRoute } from 'next'
import { PUBLIC_ORIGIN } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: ['/about', '/privacy'], disallow: ['/api/', '/auth', '/automation', '/settings', '/dashboard', '/posts/', '/write', '/candidates', '/my-posts', '/extension-connect'] }, sitemap: `${PUBLIC_ORIGIN}/sitemap.xml` }
}
