import test from "node:test";
import assert from "node:assert/strict";

// ── 代码路径归属端 LLM 标注（v0.30.0 T2）──
// 为 boundary.codePaths 每条标 targetPlatform，产出 codePathsByPlatform。
// 无 LLM / 空 codePaths → undefined（门禁降级 go，向后兼容）。

const { buildCodePathPlatformPrompt, parseCodePathPlatformCandidate, synthesizeCodePathsByPlatformOp } = await import(
  "../dist/application/workspace/analysis/codePathPlatformLabelingOps.js"
);

test("解析归属端标注：合法 JSON 按声明端解析每端路径", () => {
  const r = parseCodePathPlatformCandidate(
    JSON.stringify({ codePathsByPlatform: { web: ["web/src/a.ts", "web/src/b.ts"], ios: ["ios/App.swift"] } }),
    ["web", "ios", "android"]
  );
  assert.deepEqual(r.web, ["web/src/a.ts", "web/src/b.ts"]);
  assert.deepEqual(r.ios, ["ios/App.swift"]);
  assert.equal(r.android, undefined);
});

test("解析归属端标注：非声明端被过滤（防 LLM 输出非法端）", () => {
  const r = parseCodePathPlatformCandidate(
    JSON.stringify({ codePathsByPlatform: { web: ["web/a.ts"], fakeplatform: ["x.ts"] } }),
    ["web", "ios"]
  );
  assert.deepEqual(r.web, ["web/a.ts"]);
  assert.equal(r.ios, undefined);
  assert.equal(r.fakeplatform, undefined);
});

test("解析归属端标注：非 JSON / 无 codePathsByPlatform → undefined", () => {
  assert.equal(parseCodePathPlatformCandidate("not json", ["web"]), undefined);
  assert.equal(parseCodePathPlatformCandidate(JSON.stringify({ foo: 1 }), ["web"]), undefined);
});

test("解析归属端标注：所有端空列表 → undefined（无有效标注）", () => {
  const r = parseCodePathPlatformCandidate(
    JSON.stringify({ codePathsByPlatform: { web: [], ios: [] } }),
    ["web", "ios"]
  );
  assert.equal(r, undefined);
});

test("synthesizeCodePathsByPlatformOp：注入 mock runAnalysisPrompt 返回解析后的 codePathsByPlatform", async () => {
  const fakeRunner = {};
  const mockRun = async () => ({
    content: JSON.stringify({ codePathsByPlatform: { web: ["web/src/a.ts"], ios: ["ios/App.swift"] } })
  });
  const r = await synthesizeCodePathsByPlatformOp(
    fakeRunner,
    { iterationName: "迭代1", codePaths: ["web/src/a.ts", "ios/App.swift"], targetPlatforms: ["web", "ios"] },
    { runAnalysisPrompt: mockRun }
  );
  assert.deepEqual(r.web, ["web/src/a.ts"]);
  assert.deepEqual(r.ios, ["ios/App.swift"]);
});

test("synthesizeCodePathsByPlatformOp：agentRunner 为空 → undefined（降级，门禁降级 go）", async () => {
  const r = await synthesizeCodePathsByPlatformOp(
    null,
    { iterationName: "迭代1", codePaths: ["web/src/a.ts"], targetPlatforms: ["web"] },
    { runAnalysisPrompt: async () => ({ content: "" }) }
  );
  assert.equal(r, undefined);
});

test("synthesizeCodePathsByPlatformOp：codePaths 为空 → undefined", async () => {
  const r = await synthesizeCodePathsByPlatformOp(
    {},
    { iterationName: "迭代1", codePaths: [], targetPlatforms: ["web"] },
    { runAnalysisPrompt: async () => ({ content: "" }) }
  );
  assert.equal(r, undefined);
});

test("buildCodePathPlatformPrompt：目标端集合 + codePaths 注入 userPrompt，role 为 boundary-guardian", () => {
  const p = buildCodePathPlatformPrompt({ iterationName: "迭代1", codePaths: ["web/a.ts", "ios/b.swift"], targetPlatforms: ["web", "ios"] });
  assert.equal(p.role, "boundary-guardian");
  assert.ok(p.userPrompt.includes("web/ios"));
  assert.ok(p.userPrompt.includes("web/a.ts"));
  assert.ok(p.userPrompt.includes("ios/b.swift"));
});
