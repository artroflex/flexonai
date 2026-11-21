import 'server-only'
import { NextResponse } from 'next/server'
import { getSettings, listOwners } from './store'
import { resolvePublishHours, scheduledRunId } from './rules'

export async function runAutomationCron(request: Request, slot: number) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { scheduledRunId(slot) } catch { return NextResponse.json({ error: 'invalid schedule slot' }, { status: 400 }) }
  const owners = await listOwners()
  // Each owner gets an independent function budget; a slow account cannot exhaust
  // the dispatcher and prevent the remaining users' scheduled posts.
  const results = await Promise.all(owners.map(async userId => {
    try {
      const settings = await getSettings(userId)
      if (!settings.enabled || !resolvePublishHours(settings.publishHours).includes(slot)) return { userId, status: 'not_due' }
      const response = await fetch(new URL('/api/cron/automation/user', request.url), {
        method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, 'content-type': 'application/json' },
        body: JSON.stringify({ userId, slot }), signal: AbortSignal.timeout(270000),
      })
      if (!response.ok) return { userId, status: 'failed' }
      return { userId, ...await response.json() }
    } catch { return { userId, status: 'blocked_or_already_run' } }
  }))
  return NextResponse.json({ slot, results })
}
