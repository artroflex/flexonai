import { runAutomationCron } from '@/lib/automation/cron'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET(request: Request, context: { params: Promise<{ slot: string }> }) {
  const { slot } = await context.params
  return runAutomationCron(request, Number(slot))
}
