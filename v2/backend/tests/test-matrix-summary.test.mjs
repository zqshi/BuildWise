import test from "node:test";
import assert from "node:assert/strict";

// ── 测试矩阵按端聚合：每端 coverage/passRate 独立（v0.30.0 T1）──

const { summarizeTestMatrixByPlatform } = await import(
  "../dist/application/workspace/changeControl/testMatrixSummaryOps.js"
);

const mk = (targetPlatform, status) => ({ targetPlatform, executionStatus: status });

test("按端聚合：各端用例正确分组，coverage/passRate 独立计算", () => {
  const r = summarizeTestMatrixByPlatform([
    mk("web", "passed"), mk("web", "passed"), mk("web", "failed"),
    mk("ios", "passed"), mk("ios", "pending")
  ], ["web", "ios"]);
  assert.equal(r.perPlatform.length, 2);
  const web = r.perPlatform.find((p) => p.platform === "web");
  const ios = r.perPlatform.find((p) => p.platform === "ios");
  assert.equal(web.summary.total, 3);
  assert.equal(web.summary.passed, 2);
  assert.equal(web.summary.failed, 1);
  assert.equal(web.summary.coverage, 100);
  assert.equal(web.summary.passRate, Math.round((2 / 3) * 100));
  assert.equal(ios.summary.total, 2);
  assert.equal(ios.summary.executed, 1);
  assert.equal(ios.summary.coverage, 50);
});

test("按端聚合：overall 汇总全部用例（跨端）", () => {
  const r = summarizeTestMatrixByPlatform([
    mk("web", "passed"), mk("ios", "failed")
  ], ["web", "ios"]);
  assert.equal(r.overall.total, 2);
  assert.equal(r.overall.passed, 1);
  assert.equal(r.overall.failed, 1);
});

test("按端聚合：声明端无用例时该端 total=0 coverage 100（无遗漏）", () => {
  const r = summarizeTestMatrixByPlatform([mk("web", "passed")], ["web", "ios", "android"]);
  const ios = r.perPlatform.find((p) => p.platform === "ios");
  const android = r.perPlatform.find((p) => p.platform === "android");
  assert.equal(ios.summary.total, 0);
  assert.equal(ios.summary.coverage, 100);
  assert.equal(android.summary.total, 0);
  assert.equal(android.summary.coverage, 100);
});

test("按端聚合：用例归属端不在声明集合时计入 overall 但不进任何 perPlatform", () => {
  const r = summarizeTestMatrixByPlatform([mk("harmony", "passed")], ["web", "ios"]);
  assert.equal(r.overall.total, 1);
  assert.equal(r.perPlatform.every((p) => p.summary.total === 0), true);
});

test("按端聚合：空矩阵 + 空端集合，overall coverage 100（向后兼容）", () => {
  const r = summarizeTestMatrixByPlatform([], []);
  assert.equal(r.overall.total, 0);
  assert.equal(r.overall.coverage, 100);
  assert.deepEqual(r.perPlatform, []);
});
