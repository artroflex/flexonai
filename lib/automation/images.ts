import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
import crypto from 'node:crypto'
import sharp from 'sharp'
import { findLicensedPhotos, downloadPhoto, canonicalLicenseUrl, type LicensedPhoto } from './licensedPhotos'

export async function collectNewsPhotos(userId: string, jobId: string, queries: string[], count: 4 | 5): Promise<LicensedPhoto[]> {
  const bucket = createAdminClient().storage.from('post-images')
  const signal = AbortSignal.timeout(90000)
  const photos = await findLicensedPhotos(queries, count, fetch, signal)
  const stored: string[] = []
  try {
    for (const [index, photo] of photos.entries()) {
      const page = await fetch(photo.sourceUrl, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) })
      if (!page.ok) throw new Error('원본 사진 페이지에서 이용 조건을 재확인하지 못했습니다.')
      const markup = await page.text()
      const links = [...markup.matchAll(/href=["']([^"']+)["']/gi)].map(m => canonicalLicenseUrl(m[1]))
      if (!links.includes(photo.licenseUrl)) throw new Error('원본 사진 페이지에서 이용 조건을 재확인하지 못했습니다.')
      const bytes = await downloadPhoto(photo, fetch, signal)
      if (crypto.createHash('sha1').update(bytes).digest('hex') !== photo.sha1) throw new Error('사진 원본이 변경되어 이용 조건을 다시 확인해야 합니다.')
      const metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata()
      if (!['jpeg', 'png'].includes(metadata.format ?? '')) throw new Error('실제 사진 파일 형식을 확인하지 못했습니다.')
      const path = `${userId}/ai-auto-blog/photo-${jobId}-${index + 1}.${photo.mime === 'image/jpeg' ? 'jpg' : 'png'}`
      const { error } = await bucket.upload(path, Buffer.from(bytes), { contentType: photo.mime, upsert: false })
      if (error) throw new Error('이용 조건을 확인한 사진을 저장하지 못했습니다.')
      stored.push(path)
      photo.url = bucket.getPublicUrl(path).data.publicUrl
    }
    return photos
  } catch (error) {
    if (stored.length) await bucket.remove(stored)
    throw error
  }
}
