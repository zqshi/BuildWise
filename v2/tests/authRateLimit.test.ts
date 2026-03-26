import assert from "node:assert/strict";
import test from "node:test";
import { extractRetryAfterSeconds, formatSmsRateLimitMessage } from "../src/app/authRateLimit.ts";

test("extractRetryAfterSeconds reads retry-after metadata from API errors", () => {
  assert.equal(extractRetryAfterSeconds("API error: 429: too many requests [retry-after=58]"), 58);
  assert.equal(extractRetryAfterSeconds("API error: 429"), 0);
});

test("formatSmsRateLimitMessage gives user-facing cooldown guidance", () => {
  assert.equal(formatSmsRateLimitMessage(58), "请求过于频繁，请在 58 秒后重试");
  assert.equal(formatSmsRateLimitMessage(0), "请求过于频繁，请稍后再试");
});
