import test from "node:test";
import assert from "node:assert/strict";

// ── 代码路径按端统计（v0.30.0 T2）──
// 每端白名单 rule 数 + 匹配的 changedPath 数；ruleCount>0 且 0 改动 → 该端未完成（端级门禁依据）。
// 与 assertBoundaryWhitelist（越界阻断）正交：只统计不阻断。

const { summarizeCodeChangesByPlatform } = await import(
  "../dist/application/workspace/changeControl/codePathByPlatformOps.js"
);

test("按端统计：各端 changedFileCount 独立计算，目录前缀匹配", () => {
  const r = summarizeCodeChangesByPlatform(
    ["web/src/a.ts", "web/src/b.ts", "ios/App.swift", "docs/readme.md"],
    { web: ["web/src"], ios: ["ios/App.swift"], android: ["android/"] },
    ["web", "ios", "android"]
  );
  const web = r.perPlatform.find((p) => p.platform === "web");
  assert.equal(web.ruleCount, 1);
  assert.equal(web.changedFileCount, 2);
  assert.equal(web.hasChange, true);
  const ios = r.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.ruleCount, 1);
  assert.equal(ios.changedFileCount, 1);
  assert.equal(ios.hasChange, true);
  const android = r.perPlatform.find((p) => p.platform === "android");
  assert.equal(android.ruleCount, 1);
  assert.equal(android.changedFileCount, 0);
  assert.equal(android.hasChange, false);
});

test("按端统计：ruleCount>0 且 0 改动 → hasChange=false（端级门禁判定该端未完成）", () => {
  const r = summarizeCodeChangesByPlatform(
    ["web/src/a.ts"],
    { web: ["web/src"], ios: ["ios/src"] },
    ["web", "ios"]
  );
  const ios = r.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.ruleCount, 1);
  assert.equal(ios.changedFileCount, 0);
  assert.equal(ios.hasChange, false);
});

test("按端统计：codePathsByPlatform 缺失 → 各端 ruleCount=0（降级，不涉及代码不阻断）", () => {
  const r = summarizeCodeChangesByPlatform(["web/src/a.ts"], undefined, ["web", "ios"]);
  assert.equal(r.perPlatform.every((p) => p.ruleCount === 0 && !p.hasChange), true);
});

test("按端统计：声明端但 codePathsByPlatform 无该端 → ruleCount=0（不涉及代码）", () => {
  const r = summarizeCodeChangesByPlatform(
    ["web/src/a.ts"],
    { web: ["web/src"] },
    ["web", "ios"]
  );
  const ios = r.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.ruleCount, 0);
  assert.equal(ios.hasChange, false);
});

test("按端统计：空 changedPaths + 有白名单 → 各端 hasChange=false", () => {
  const r = summarizeCodeChangesByPlatform([], { web: ["web/src"] }, ["web"]);
  const web = r.perPlatform.find((p) => p.platform === "web");
  assert.equal(web.ruleCount, 1);
  assert.equal(web.changedFileCount, 0);
  assert.equal(web.hasChange, false);
});

test("按端统计：路径等于 rule 本身（非目录前缀）也算匹配", () => {
  const r = summarizeCodeChangesByPlatform(
    ["ios/App.swift"],
    { ios: ["ios/App.swift"] },
    ["ios"]
  );
  const ios = r.perPlatform.find((p) => p.platform === "ios");
  assert.equal(ios.changedFileCount, 1);
  assert.equal(ios.hasChange, true);
});

test("按端统计：codePathsByPlatform value 非数组（持久化数据损坏）→ ruleCount=0 不崩", () => {
  const r = summarizeCodeChangesByPlatform(
    ["web/src/a.ts"],
    { web: "not-an-array" },
    ["web"]
  );
  const web = r.perPlatform.find((p) => p.platform === "web");
  assert.equal(web.ruleCount, 0);
  assert.equal(web.hasChange, false);
});
