export function extractRetryAfterSeconds(message: string) {
  const match = message.match(/retry-after=(\d+)/i);
  if (!match) {
    return 0;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function formatSmsRateLimitMessage(seconds: number) {
  return seconds > 0 ? `请求过于频繁，请在 ${seconds} 秒后重试` : "请求过于频繁，请稍后再试";
}
