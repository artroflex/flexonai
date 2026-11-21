import { requireProgramAccess } from '@/utils/access'
import PublishingWorkspace from './_components/PublishingWorkspace'

// 로그인 후 첫 화면은 네이버 자동발행 작업 공간이다.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function Page() {
  await requireProgramAccess()
  return <PublishingWorkspace />
}
