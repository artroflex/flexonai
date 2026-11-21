import { runAutomationCron } from '@/lib/automation/cron'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function GET(request: Request) {
  return runAutomationCron(request, 9)
}
