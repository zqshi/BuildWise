import test from "node:test";
import assert from "node:assert/strict";

// ── 发布评审按端聚合：堵死「虚假 go」的核心规则（v0.29.0）──

const { aggregateReleaseReviewByPlatform } = await import(
  "../dist/application/workspace/analysis/releaseReviewOps.js"
);

test("各声明端均 go 时，整体可发布（顶层 go）", () => {
  const r = aggregateReleaseReviewByPlatform({
    targetPlatforms: ["web", "ios", "harmony"],
    perPlatform: [
      { platform: "web", decision: "go", reason: "", blockers: [] },
      { platform: "ios", decision: "go", reason: "", blockers: [] },
      { platform: "harmony", decision: "go", reason: "", blockers: [] }
    ]
  });
  assert.equal(r.decision, "go");
  assert.deepEqual(r.missingPlatforms, []);
  assert.deepEqual(r.blockers, []);
});

test("某声明端阻断时，整体不可发布（虚假 go 被堵）", () => {
  const r = aggregateReleaseReviewByPlatform({
    targetPlatforms: ["web", "ios"],
    perPlatform: [
      { platform: "web", decision: "go", reason: "", blockers: [] },
      { platform: "ios", decision: "block", reason: "iOS 真机崩溃", blockers: ["启动崩溃", "权限缺失"] }
    ]
  });
  assert.equal(r.decision, "block");
  assert.deepEqual(r.missingPlatforms, []);
  assert.ok(r.blockers.some((b) => b.includes("ios") && b.includes("启动崩溃")));
});

test("声明了端但未给出该端评审结论时，整体阻断（堵漏评某端就 go）", () => {
  const r = aggregateReleaseReviewByPlatform({
    targetPlatforms: ["web", "android"],
    perPlatform: [{ platform: "web", decision: "go", reason: "", blockers: [] }]
  });
  assert.equal(r.decision, "block");
  assert.deepEqual(r.missingPlatforms, ["android"]);
  assert.ok(r.blockers.some((b) => b.includes("android") && b.includes("未给出")));
});

test("存在谨慎端但无阻断端时，整体谨慎发布（caution）", () => {
  const r = aggregateReleaseReviewByPlatform({
    targetPlatforms: ["web", "ios"],
    perPlatform: [
      { platform: "web", decision: "go", reason: "", blockers: [] },
      { platform: "ios", decision: "caution", reason: "iOS 覆盖率偏低", blockers: [] }
    ]
  });
  assert.equal(r.decision, "caution");
  assert.deepEqual(r.missingPlatforms, []);
});

test("perPlatform 出现未声明的端时被忽略，不污染顶层决策", () => {
  const r = aggregateReleaseReviewByPlatform({
    targetPlatforms: ["web"],
    perPlatform: [
      { platform: "web", decision: "go", reason: "", blockers: [] },
      { platform: "ios", decision: "block", reason: "未声明端的噪声", blockers: ["x"] }
    ]
  });
  assert.equal(r.decision, "go");
  assert.deepEqual(r.missingPlatforms, []);
});

test("空目标端集合时整体可发布（向后兼容，纯 web 默认由规范化处理）", () => {
  const r = aggregateReleaseReviewByPlatform({ targetPlatforms: [], perPlatform: [] });
  assert.equal(r.decision, "go");
});
