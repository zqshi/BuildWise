import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/interfaces/http/routes/authRoutes.ts", import.meta.url), "utf8");

test("sms auth route returns retry-after headers for request rate limiting", () => {
  assert.match(source, /function replyWithRetryAfter\(reply:/);
  assert.match(source, /reply\.header\("retry-after", String\(Math\.max\(1, Math\.ceil\(retryAfterSec\)\)\)\);/);
  assert.match(source, /return replyWithRetryAfter\([\s\S]*"请求过于频繁，请稍后再试"/);
  assert.match(source, /return replyWithRetryAfter\([\s\S]*"请稍后再试，每60秒只能发送一次验证码"/);
});
