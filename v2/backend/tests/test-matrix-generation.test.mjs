import test from "node:test";
import assert from "node:assert/strict";

// ── 测试矩阵生成：接通 qa-reviewer 死代码（v0.30.0 T1）──
// 每条用例标注单端 targetPlatform，缺失/非法兜底 web。

const { parseTestMatrixCandidate, synthesizeTestMatrixOp, buildTestMatrixPrompt } = await import(
  "../dist/application/workspace/analysis/testMatrixGenerationOps.js"
);

test("解析测试矩阵：合法 JSON 正确解析用例与 targetPlatform", () => {
  const content = JSON.stringify({ testMatrix: [
    { type: "unit", caseId: "c1", focus: "登录", expected: "成功", evidence: "v1", targetPlatform: "ios" },
    { type: "e2e", caseId: "c2", focus: "支付", expected: "完成", evidence: "v2", targetPlatform: "android" }
  ]});
  const r = parseTestMatrixCandidate(content);
  assert.equal(r.length, 2);
  assert.equal(r[0].targetPlatform, "ios");
  assert.equal(r[1].targetPlatform, "android");
  assert.equal(r[0].executionStatus, "pending");
});

test("解析测试矩阵：缺失 targetPlatform 兜底为 web", () => {
  const content = JSON.stringify({ testMatrix: [
    { type: "unit", caseId: "c1", focus: "登录", expected: "成功", evidence: "v1" }
  ]});
  const r = parseTestMatrixCandidate(content);
  assert.equal(r[0].targetPlatform, "web");
});

test("解析测试矩阵：非法 targetPlatform 兜底为 web", () => {
  const content = JSON.stringify({ testMatrix: [
    { type: "unit", caseId: "c1", focus: "f", expected: "e", evidence: "v", targetPlatform: "foo" }
  ]});
  const r = parseTestMatrixCandidate(content);
  assert.equal(r[0].targetPlatform, "web");
});

test("解析测试矩阵：非 JSON / 无 testMatrix 数组 / 非数组均返回空", () => {
  assert.deepEqual(parseTestMatrixCandidate("not json"), []);
  assert.deepEqual(parseTestMatrixCandidate(JSON.stringify({ other: 1 })), []);
  assert.deepEqual(parseTestMatrixCandidate(JSON.stringify({ testMatrix: "not-array" })), []);
});

test("解析测试矩阵：缺失 caseId 自动补全", () => {
  const content = JSON.stringify({ testMatrix: [
    { type: "unit", focus: "f", expected: "e", evidence: "v", targetPlatform: "web" }
  ]});
  const r = parseTestMatrixCandidate(content);
  assert.equal(r[0].caseId, "auto-case-1");
});

test("synthesizeTestMatrixOp：注入 mock runAnalysisPrompt 返回解析后的用例", async () => {
  const mockContent = JSON.stringify({ testMatrix: [
    { type: "unit", caseId: "c1", focus: "登录", expected: "成功", evidence: "v1", targetPlatform: "ios" }
  ]});
  const mockRunAnalysisPrompt = async () => ({ content: mockContent });
  const r = await synthesizeTestMatrixOp(
    {},
    { iterationName: "迭代1", sourceType: "single-file", excerpt: "附件节选", targetPlatforms: ["web", "ios"] },
    { runAnalysisPrompt: mockRunAnalysisPrompt }
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].targetPlatform, "ios");
});

test("synthesizeTestMatrixOp：agentRunner 为空时返回空数组（降级，不阻断管道）", async () => {
  const r = await synthesizeTestMatrixOp(
    null,
    { iterationName: "x", sourceType: "single-file", excerpt: "", targetPlatforms: ["web"] },
    { runAnalysisPrompt: async () => ({ content: "" }) }
  );
  assert.deepEqual(r, []);
});

test("buildTestMatrixPrompt：目标端集合注入 userPrompt，role 为 qa-reviewer", () => {
  const p = buildTestMatrixPrompt({ iterationName: "迭代1", sourceType: "single-file", excerpt: "x", targetPlatforms: ["web", "ios", "android"] });
  assert.ok(p.userPrompt.includes("web/ios/android"));
  assert.ok(p.userPrompt.includes("目标端"));
  assert.equal(p.role, "qa-reviewer");
  assert.ok(p.expectedOutput.includes("testMatrix"));
});
