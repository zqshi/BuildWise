import test from "node:test";
import assert from "node:assert/strict";

// ── 代码改动就绪度端级门禁（v0.30.0 T2）──
// 某端 codePathsByPlatform 有 rule 但无改动 → block（堵「声明多端只改部分端代码就标可发布」）。
// ruleCount=0（该端不涉及代码）不阻断；codePathsByPlatform 缺失降级 go（向后兼容）。

const { assessPlatformCodeChangeReadiness } = await import(
  "../dist/application/workspace/analysis/releaseReviewOps.js"
);

test("代码改动就绪：各端都有改动 → go", () => {
  const r = assessPlatformCodeChangeReadiness(
    ["web/src/a.ts", "ios/App.swift"],
    { web: ["web/src"], ios: ["ios/"] },
    ["web", "ios"]
  );
  assert.equal(r.decision, "go");
  assert.equal(r.blockers.length, 0);
});

test("代码改动就绪：某端 ruleCount>0 但无改动 → block", () => {
  const r = assessPlatformCodeChangeReadiness(
    ["web/src/a.ts"],
    { web: ["web/src"], ios: ["ios/src"] },
    ["web", "ios"]
  );
  assert.equal(r.decision, "block");
  assert.ok(r.blockers.some((b) => b.includes("ios")));
});

test("代码改动就绪：声明端但 codePathsByPlatform 无该端 → ruleCount=0 不阻断", () => {
  const r = assessPlatformCodeChangeReadiness(
    ["web/src/a.ts"],
    { web: ["web/src"] },
    ["web", "ios"]
  );
  assert.equal(r.decision, "go");
});

test("代码改动就绪：codePathsByPlatform undefined → go（降级，向后兼容）", () => {
  const r = assessPlatformCodeChangeReadiness(["web/src/a.ts"], undefined, ["web", "ios"]);
  assert.equal(r.decision, "go");
});

test("代码改动就绪：多端有白名单但全无改动 → block 且 blockers 含各端", () => {
  const r = assessPlatformCodeChangeReadiness(
    [],
    { web: ["web/src"], ios: ["ios/"] },
    ["web", "ios"]
  );
  assert.equal(r.decision, "block");
  assert.ok(r.blockers.some((b) => b.includes("web")));
  assert.ok(r.blockers.some((b) => b.includes("ios")));
});
