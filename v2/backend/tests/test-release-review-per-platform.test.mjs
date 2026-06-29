import test from "node:test";
import assert from "node:assert/strict";

// ── releaseReview 按端评审解析与校验（v0.30.0 T3）──
// parseReleaseReviewCandidate 解析 perPlatform（每端 decision/reason/blockers）；
// listReleaseReviewMissingReasons 校验声明端都评审（targetPlatforms 可选，向后兼容）。
// synthesizeReleaseReviewOp 编造防控（mock runAnalysisPrompt）：有数据端漏评→block，无数据端降级整体结论。

const { parseReleaseReviewCandidate, listReleaseReviewMissingReasons } = await import(
  "../dist/application/workspace/analysis/releaseReviewOps.js"
);
const { synthesizeReleaseReviewOp } = await import(
  "../dist/application/workspace/analysis/governanceRunnerOps.js"
);
const { summarizeTestMatrixByPlatform } = await import(
  "../dist/application/workspace/changeControl/testMatrixSummaryOps.js"
);

const baseSignals = { testCaseCount: 5, p0FindingCount: 0, unknownSignalCount: 0, boundaryCoverage: 80 };

test("parse perPlatform：合法 JSON 按端解析 decision/reason/blockers", () => {
  const c = parseReleaseReviewCandidate(JSON.stringify({
    decision: "caution", reason: "整体谨慎", score: 70, recommendations: ["建议1"],
    perPlatform: [
      { platform: "web", decision: "go", reason: "web 端就绪", blockers: [] },
      { platform: "ios", decision: "block", reason: "ios 端阻断", blockers: ["ios 未就绪"] }
    ]
  }), baseSignals);
  assert.equal(c.perPlatform.length, 2);
  const web = c.perPlatform.find((p) => p.platform === "web");
  assert.equal(web.decision, "go");
  const ios = c.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.decision, "block");
  assert.deepEqual(ios.blockers, ["ios 未就绪"]);
});

test("parse perPlatform：非法 decision 兜底 caution", () => {
  const c = parseReleaseReviewCandidate(JSON.stringify({
    decision: "go", reason: "r", recommendations: ["x"],
    perPlatform: [{ platform: "web", decision: "invalid", reason: "", blockers: [] }]
  }), baseSignals);
  assert.equal(c.perPlatform[0].decision, "caution");
});

test("parse perPlatform：无 perPlatform → 空数组", () => {
  const c = parseReleaseReviewCandidate(JSON.stringify({ decision: "go", reason: "r", recommendations: ["x"] }), baseSignals);
  assert.deepEqual(c.perPlatform, []);
});

test("listMissing：声明端都评审 → 无 perPlatform missing", () => {
  const c = parseReleaseReviewCandidate(JSON.stringify({
    decision: "caution", reason: "r", recommendations: ["x"],
    perPlatform: [{ platform: "web", decision: "go", reason: "", blockers: [] }, { platform: "ios", decision: "go", reason: "", blockers: [] }]
  }), baseSignals);
  const missing = listReleaseReviewMissingReasons(c, ["web", "ios"]);
  assert.ok(!missing.some((m) => m.includes("未给出按端评审")));
});

test("listMissing：某声明端漏评 → 报 missing", () => {
  const c = parseReleaseReviewCandidate(JSON.stringify({
    decision: "caution", reason: "r", recommendations: ["x"],
    perPlatform: [{ platform: "web", decision: "go", reason: "", blockers: [] }]
  }), baseSignals);
  const missing = listReleaseReviewMissingReasons(c, ["web", "ios"]);
  assert.ok(missing.some((m) => m.includes("ios") && m.includes("未给出按端评审")));
});

test("listMissing：无 targetPlatforms → 不校验 perPlatform（向后兼容）", () => {
  const c = parseReleaseReviewCandidate(JSON.stringify({
    decision: "caution", reason: "r", recommendations: ["x"],
    perPlatform: []
  }), baseSignals);
  const missing = listReleaseReviewMissingReasons(c);
  assert.ok(!missing.some((m) => m.includes("按端评审")));
});

// ── 编造防控：synthesizeReleaseReviewOp 末尾 finalizeReleaseReviewPerPlatform ──
// 有按端质量数据的端（测试用例或代码白名单）漏评 → 该端 block；无数据端漏评 → 降级整体结论（不编造独立判断）。

const mk = (targetPlatform, status) => ({ targetPlatform, executionStatus: status });
const mockPromptReturning = (content) => async () => ({ content });
const baseReleaseReviewParams = (overrides) => ({
  iterationName: "迭代1",
  sourceType: "single-file",
  excerpt: "附件节选",
  prioritizedFindings: [],
  blockers: [],
  releaseGates: [],
  rollbackPlan: [],
  recommendations: ["建议1"],
  qualitySignals: { testCaseCount: 5, p0FindingCount: 0, unknownSignalCount: 0, boundaryCoverage: 80 },
  ...overrides
});

test("编造防控：有测试数据的端被漏评 → 该端须阻断，不得编造可发布结论", async () => {
  const targetPlatforms = ["web", "ios"];
  // ios 有测试用例（有数据），web 无用例
  const testMatrixByPlatform = summarizeTestMatrixByPlatform([mk("ios", "passed")], targetPlatforms);
  const llmContent = JSON.stringify({
    decision: "go", reason: "整体可发布", score: 80, recommendations: ["建议1"],
    perPlatform: [{ platform: "web", decision: "go", reason: "web 就绪", blockers: [] }]
  });
  const result = await synthesizeReleaseReviewOp(
    {},
    baseReleaseReviewParams({ targetPlatforms, testMatrixByPlatform }),
    { runAnalysisPrompt: mockPromptReturning(llmContent) }
  );
  const web = result.perPlatform.find((p) => p.platform === "web");
  assert.equal(web.decision, "go", "已评审端保留原结论");
  const ios = result.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.decision, "block", "有数据端漏评须阻断，不得编造可发布");
  assert.ok(ios.blockers.length > 0, "漏评端须给出阻断项");
});

test("编造防控：仅有代码白名单的端被漏评 → 该端须阻断（代码归属依据路径）", async () => {
  const targetPlatforms = ["web", "ios"];
  // 无测试用例，但 ios 有代码白名单 → ios 有数据
  const testMatrixByPlatform = summarizeTestMatrixByPlatform([], targetPlatforms);
  const codePathsByPlatform = { ios: ["src/ios/auth.swift"] };
  const llmContent = JSON.stringify({
    decision: "go", reason: "整体可发布", score: 80, recommendations: ["建议1"],
    perPlatform: [{ platform: "web", decision: "go", reason: "web 就绪", blockers: [] }]
  });
  const result = await synthesizeReleaseReviewOp(
    {},
    baseReleaseReviewParams({ targetPlatforms, testMatrixByPlatform, codePathsByPlatform }),
    { runAnalysisPrompt: mockPromptReturning(llmContent) }
  );
  const ios = result.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.decision, "block", "有代码白名单端漏评须阻断");
});

test("编造防控：无按端质量数据的端被漏评 → 降级为整体结论，不编造独立判断", async () => {
  const targetPlatforms = ["web", "ios"];
  // web 有用例，ios 既无用例也无代码白名单 → ios 无数据
  const testMatrixByPlatform = summarizeTestMatrixByPlatform([mk("web", "passed")], targetPlatforms);
  const llmContent = JSON.stringify({
    decision: "caution", reason: "整体谨慎", score: 60, recommendations: ["建议1"],
    perPlatform: [{ platform: "web", decision: "caution", reason: "web 谨慎", blockers: [] }]
  });
  const result = await synthesizeReleaseReviewOp(
    {},
    baseReleaseReviewParams({ targetPlatforms, testMatrixByPlatform }),
    { runAnalysisPrompt: mockPromptReturning(llmContent) }
  );
  const ios = result.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.decision, "caution", "无数据端降级为整体结论");
  assert.deepEqual(ios.blockers, [], "降级端不编造阻断项");
  assert.ok(ios.reason.includes("降级") || ios.reason.includes("无按端数据"), "降级原因须说明无按端数据");
});

test("编造防控：声明端逐端评审齐全 → 保留每端结论，不补不改", async () => {
  const targetPlatforms = ["web", "ios"];
  const testMatrixByPlatform = summarizeTestMatrixByPlatform([mk("web", "passed"), mk("ios", "pending")], targetPlatforms);
  const llmContent = JSON.stringify({
    decision: "caution", reason: "整体谨慎", score: 60, recommendations: ["建议1"],
    perPlatform: [
      { platform: "web", decision: "go", reason: "web 就绪", blockers: [] },
      { platform: "ios", decision: "caution", reason: "ios 待验证", blockers: ["ios 未完成测试"] }
    ]
  });
  const result = await synthesizeReleaseReviewOp(
    {},
    baseReleaseReviewParams({ targetPlatforms, testMatrixByPlatform }),
    { runAnalysisPrompt: mockPromptReturning(llmContent) }
  );
  assert.equal(result.perPlatform.length, 2);
  const web = result.perPlatform.find((p) => p.platform === "web");
  assert.equal(web.decision, "go");
  const ios = result.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.decision, "caution");
  assert.deepEqual(ios.blockers, ["ios 未完成测试"]);
});

test("编造防控：未声明目标端 → 不补按端结论（向后兼容）", async () => {
  const llmContent = JSON.stringify({
    decision: "go", reason: "可发布", score: 85, recommendations: ["建议1"]
  });
  const result = await synthesizeReleaseReviewOp(
    {},
    baseReleaseReviewParams({}),  // 不传 targetPlatforms
    { runAnalysisPrompt: mockPromptReturning(llmContent) }
  );
  assert.deepEqual(result.perPlatform, [], "未声明目标端时不产出按端结论");
});
