import test from "node:test";
import assert from "node:assert/strict";

// ── 各声明目标端须有就绪交付物：堵「声明多端但只产出部分端」的虚假推进（v0.29.0）──

const { assessPlatformDeliveryReadiness } = await import(
  "../dist/application/workspace/analysis/releaseReviewOps.js"
);

const ready = (platform, status = "ready") => ({ targetPlatform: platform, status });

test("各声明端均有就绪交付物时，整体可发布（go）", () => {
  const r = assessPlatformDeliveryReadiness(["web", "ios"], [ready("web"), ready("ios")]);
  assert.equal(r.decision, "go");
  assert.deepEqual(r.blockers, []);
});

test("某声明端无就绪交付物时，整体阻断（虚假 go 被堵）", () => {
  const r = assessPlatformDeliveryReadiness(["web", "ios", "harmony"], [ready("web"), ready("ios")]);
  assert.equal(r.decision, "block");
  assert.ok(r.blockers.some((b) => b.includes("harmony") && b.includes("就绪交付物")));
});

test("交付物存在但未覆盖某声明端时，该端视为缺失就绪（堵漏端）", () => {
  const r = assessPlatformDeliveryReadiness(["web", "android"], [ready("web")]);
  assert.equal(r.decision, "block");
  assert.ok(r.blockers.some((b) => b.includes("android")));
});

test("未标 targetPlatform 的就绪交付物不归属任何声明端", () => {
  const r = assessPlatformDeliveryReadiness(["web"], [{ status: "ready" }]);
  assert.equal(r.decision, "block");
  assert.ok(r.blockers.some((b) => b.includes("web")));
});

test("partial / pending 交付物不计为就绪", () => {
  assert.equal(assessPlatformDeliveryReadiness(["web"], [ready("web", "partial")]).decision, "block");
  assert.equal(assessPlatformDeliveryReadiness(["web"], [ready("web", "pending")]).decision, "block");
});

test("空目标端集合时放行（向后兼容，纯 web 默认由规范化处理）", () => {
  const r = assessPlatformDeliveryReadiness([], [ready("web")]);
  assert.equal(r.decision, "go");
});
