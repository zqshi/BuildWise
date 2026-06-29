import test from "node:test";
import assert from "node:assert/strict";

// ── 测试用例归属端：单端 targetPlatform 规范化兜底（v0.30.0 T1）──
// 用例归属端为单值 TargetPlatform；缺失/非法时兜底 web（向后兼容历史空数据）。

const { normalizeTestQualityUx } = await import(
  "../dist/application/workspace/shared/normalizeChangeControlFields.js"
);

test("测试用例归属端：合法 targetPlatform 原样保留", () => {
  const r = normalizeTestQualityUx({
    generatedTestMatrix: [
      { type: "unit", caseId: "c1", focus: "登录", expected: "成功", evidence: "v1", targetPlatform: "ios" }
    ]
  });
  assert.equal(r.generatedTestMatrix[0].targetPlatform, "ios");
});

test("测试用例归属端：缺失 targetPlatform 兜底为 web（向后兼容历史数据）", () => {
  const r = normalizeTestQualityUx({
    generatedTestMatrix: [
      { type: "unit", caseId: "c2", focus: "登出", expected: "成功", evidence: "v2" }
    ]
  });
  assert.equal(r.generatedTestMatrix[0].targetPlatform, "web");
});

test("测试用例归属端：非法 targetPlatform 兜底为 web", () => {
  const r = normalizeTestQualityUx({
    generatedTestMatrix: [
      { type: "unit", caseId: "c3", focus: "注册", expected: "成功", evidence: "v3", targetPlatform: "not-a-platform" }
    ]
  });
  assert.equal(r.generatedTestMatrix[0].targetPlatform, "web");
});
