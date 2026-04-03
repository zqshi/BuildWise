/**
 * Extract retry-after seconds from various rate-limit error message formats:
 *
 * - @fastify/rate-limit: "Rate limit exceeded, retry in 50 seconds"
 * - fetchJSON 429 auto-retry fallback: "API error: 429: Rate limit exceeded, retry in 50 seconds"
 * - Backend custom: "retry-after=50"
 * - Backend Chinese: "请稍后再试，每60秒只能发送一次验证码"
 * - General: any "N 秒" or "N seconds" or "N秒后" pattern
 */
export function extractRetryAfterSeconds(message: string): number {
  // retry-after=N (custom header-style)
  const headerMatch = message.match(/retry-after=(\d+)/i);
  if (headerMatch) {
    const seconds = Number(headerMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  // "retry in N seconds" (@fastify/rate-limit default format)
  const retryInMatch = message.match(/retry\s+in\s+(\d+)\s*s/i);
  if (retryInMatch) {
    const seconds = Number(retryInMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  // "N 秒后重试" / "N秒" / "每N秒" (Chinese messages)
  const chineseMatch = message.match(/(\d+)\s*秒/);
  if (chineseMatch) {
    const seconds = Number(chineseMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }

  return 0;
}

export function formatSmsRateLimitMessage(seconds: number) {
  return seconds > 0 ? `请求过于频繁，请在 ${seconds} 秒后重试` : "请求过于频繁，请稍后再试";
}
