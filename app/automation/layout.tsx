import { requireProgramAccess } from '@/utils/access'
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireProgramAccess()
  return children
}
