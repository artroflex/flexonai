import 'server-only'
import { NextResponse } from 'next/server'
import { generateJob } from './engine'
import { listOwners } from './store'
import { scheduledRunId } from './rules'

export async function runAutomationCron(request: Request, slot: number) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { scheduledRunId(slot) } catch { return NextResponse.json({ error: 'invalid schedule slot' }, { status: 400 }) }
  const owners = await listOwners()
  const results = []
  for (const id of owners.slice(0, 5)) {
    try { const job = await generateJob(id, true, slot); results.push({ userId: id, jobId: job?.id ?? null, status: job?.status ?? 'disabled' }) }
    catch { results.push({ userId: id, status: 'blocked_or_already_run' }) }
  }
  return NextResponse.json({ slot, results, remainingOwners: Math.max(0, owners.length - 5) })
}
