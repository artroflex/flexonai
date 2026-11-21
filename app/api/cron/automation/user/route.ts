import { NextResponse } from 'next/server'
import { generateJob } from '@/lib/automation/engine'
import { scheduledRunId } from '@/lib/automation/rules'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const { userId, slot } = await request.json()
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/.test(userId)) return NextResponse.json({ error: 'invalid owner' }, { status: 400 })
    scheduledRunId(slot)
    const job = await generateJob(userId, true, slot)
    return NextResponse.json({ jobId: job?.id ?? null, status: job?.status ?? 'not_due' })
  } catch { return NextResponse.json({ status: 'blocked_or_already_run' }) }
}
