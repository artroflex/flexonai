export type CommentOptions = { enabled: boolean; since: string | null; dailyLimit: number }
export const DEFAULT_COMMENTS: CommentOptions = { enabled: false, since: null, dailyLimit: 20 }
export type ReplyRecord = { id: string; postUrl: string; commentId: string; runId: string; reply: string; status: 'prepared' | 'sending' | 'replied' | 'uncertain' | 'skipped'; reason: string; createdAt: string; updatedAt: string; sentDate?: string }
export function parseCommentOptions(input: unknown, previous = DEFAULT_COMMENTS, now = new Date().toISOString()): CommentOptions {
  if (input === undefined) return previous
  if (!input || typeof input !== 'object') throw new Error('댓글 자동응답 설정을 확인해 주세요.')
  const v = input as Record<string, unknown>
  if (typeof v.enabled !== 'boolean' || !Number.isInteger(v.dailyLimit) || Number(v.dailyLimit) < 1 || Number(v.dailyLimit) > 50) throw new Error('댓글 자동응답은 하루 1~50건으로 설정해 주세요.')
  return { enabled: v.enabled, dailyLimit: Number(v.dailyLimit), since: v.enabled ? (previous.enabled && previous.since ? previous.since : now) : previous.since }
}
export function commentSkipReason(text: string): string | null {
  if (text.length < 2 || text.length > 1000) return '댓글 길이 확인 필요'
  if (/https?:\/\/|www\.|서로?이웃|맞방|답방|놀러\s*와|방문\s*해|홍보|광고|카톡|텔레그램|오픈채팅/i.test(text)) return '광고·방문 유도'
  if (/@|\b0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}\b|\d{6}[- ]?[1-4]\d{6}|sk-(?:proj-)?[\w-]{15,}|계좌|비밀|비밀번호|주소는|연락처/i.test(text)) return '개인정보·비공개 문의'
  if (/환불|결제|입금|수강료|신청|계약|견적|고소|소송|신고|저작권|초상권|불법|사기|표절|치료|진단|약\s*복용|투자|매수|매도|죽고\s*싶|자살|살해|혐오|씨발|병신|욕설/i.test(text)) return '민감한 문의·분쟁'
  if (/ignore|system prompt|developer message|이전\s*지시|명령을|지시를|시스템\s*프롬프트|API\s*키|코드를\s*실행/i.test(text)) return '명령·보안 관련 내용'
  return null
}
export function safeReply(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reply = value.trim().replace(/\s+/g, ' ')
  if (reply.length < 5 || reply.length > 200 || commentSkipReason(reply) || /[<>]|확정|보장|제가\s*(?:봤|갔|먹었|사용했)|문의\s*주시면/i.test(reply)) return null
  return reply
}
export function isNewComment(createdAt: string, since: string | null, now = Date.now()): boolean {
  const date = Date.parse(createdAt), start = Date.parse(since ?? '')
  return Number.isFinite(date) && Number.isFinite(start) && date >= start && date <= now + 30000
}
export function safePostContext(text: string): string {
  return text.split('\n').filter(line => !/@|https?:\/\/|\b0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}\b|sk-[\w-]{15,}/i.test(line)).join('\n').slice(0, 5000)
}
