import { NextResponse } from 'next/server'
import { generateJob } from '@/lib/automation/engine'
import { listOwners } from '@/lib/automation/store'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const owners = await listOwners()
  const results = []
  // Bound work to the function time budget; this personal deployment supports five owners.
  for (const id of owners.slice(0, 5)) {
    try { const job = await generateJob(id, true); results.push({ userId: id, jobId: job?.id ?? null, status: job?.status ?? 'disabled' }) }
    catch { results.push({ userId: id, status: 'blocked_or_already_run' }) }
  }
  return NextResponse.json({ results, remainingOwners: Math.max(0, owners.length - 5) })
}
