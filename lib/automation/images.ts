import 'server-only'
import { createAdminClient } from '@/utils/supabase/admin'
import { imageSectionIndices, type NewsDraft } from './article'
import { generateImageBatch } from './imageBatch'

export async function generateNewsImages(userId: string, jobId: string, apiKey: string, draft: NewsDraft, count: 4 | 5): Promise<string[]> {
  const bucket = createAdminClient().storage.from('post-images')
  const subjects = [{ label: '대표 이미지', context: `${draft.title}\n${draft.intro}` }, ...imageSectionIndices(count).map(i => ({ label: draft.sections[i].heading, context: draft.sections[i].paragraphs.join('\n') }))]
  return generateImageBatch(apiKey, subjects, {
    store: async (index, bytes) => {
      const path = `${userId}/ai-auto-blog/automation-${jobId}-${index + 1}.png`
      const { error } = await bucket.upload(path, bytes, { contentType: 'image/png', upsert: false })
      if (error) throw new Error('생성한 뉴스 이미지를 저장하지 못했습니다.')
      return { path, url: bucket.getPublicUrl(path).data.publicUrl }
    },
    remove: async paths => { const { error } = await bucket.remove(paths); if (error) console.error('Partial news image cleanup failed') },
  })
}
