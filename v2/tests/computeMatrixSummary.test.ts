import test from "node:test";
import assert from "node:assert/strict";

// ── 前端测试矩阵按端聚合：computeMatrixSummary perPlatform（v0.30.0 T1）──

import { computeMatrixSummary } from "../src/hooks/useAnalysisReportDerived";

const mk = (caseId: string, status: string, platform: string) => ({ caseId, executionStatus: status, targetPlatform: platform });

test("按端聚合：各端 coverage/passRate 独立计算", () => {
  const r = computeMatrixSummary([
    mk("c1", "passed", "web"), mk("c2", "failed", "web"),
    mk("c3", "passed", "ios"), mk("c4", "pending", "ios")
  ], {}, ["web", "ios"]);
  assert.equal(r.perPlatform.length, 2);
  const web = r.perPlatform.find((p) => p.platform === "web")!;
  const ios = r.perPlatform.find((p) => p.platform === "ios")!;
  assert.equal(web.summary.total, 2);
  assert.equal(web.summary.coverage, 100);
  assert.equal(ios.summary.total, 2);
  assert.equal(ios.summary.coverage, 50);
});

test("按端聚合：声明端无用例时该端 total=0 coverage 100（无遗漏）", () => {
  const r = computeMatrixSummary([mk("c1", "passed", "web")], {}, ["web", "ios"]);
  const ios = r.perPlatform.find((p) => p.platform === "ios")!;
  assert.equal(ios.summary.total, 0);
  assert.equal(ios.summary.coverage, 100);
});

test("按端聚合：statusMap 覆盖用例执行状态", () => {
  const r = computeMatrixSummary([mk("c1", "pending", "web")], { c1: "passed" }, ["web"]);
  const web = r.perPlatform.find((p) => p.platform === "web")!;
  assert.equal(web.summary.passed, 1);
  assert.equal(web.summary.coverage, 100);
});

test("按端聚合：overall 汇总全部用例（跨端）", () => {
  const r = computeMatrixSummary([
    mk("c1", "passed", "web"), mk("c2", "failed", "ios")
  ], {}, ["web", "ios"]);
  assert.equal(r.total, 2);
  assert.equal(r.passed, 1);
  assert.equal(r.failed, 1);
});

test("按端聚合：用例缺失 targetPlatform 时归入 web", () => {
  const r = computeMatrixSummary([
    { caseId: "c1", executionStatus: "passed" }
  ] as { caseId: string; executionStatus: string; targetPlatform?: string }[], {}, ["web", "ios"]);
  const web = r.perPlatform.find((p) => p.platform === "web")!;
  const ios = r.perPlatform.find((p) => p.platform === "ios")!;
  assert.equal(web.summary.total, 1);
  assert.equal(ios.summary.total, 0);
});
