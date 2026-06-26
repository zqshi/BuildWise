import test from "node:test";
import assert from "node:assert/strict";

const { mergeCodeRewriteIntoOntology } = await import(
  "../dist/application/workspace/project/ontologyCodeRewriteBridge.js"
);

function emptyKb() {
  return {
    ontologyTerms: [], stableRules: [], componentInventory: [],
    codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [],
  };
}

function edit(path) {
  return { path, reason: "编码 agent 改写", beforePreview: "old", afterPreview: "new" };
}

test("空 edits → KB 不变，mergedPaths 为空", () => {
  const result = mergeCodeRewriteIntoOntology(emptyKb(), []);
  assert.equal(result.mergedPaths.length, 0);
  assert.equal(result.updatedKb.codeMap.length, 0);
});

test("新路径 → 新增 codeMap 项「编码改写记录」", () => {
  const result = mergeCodeRewriteIntoOntology(emptyKb(), [edit("src/Button.tsx")]);
  assert.equal(result.updatedKb.codeMap.length, 1);
  assert.equal(result.updatedKb.codeMap[0].capability, "编码改写记录：src/Button.tsx");
  assert.deepEqual(result.updatedKb.codeMap[0].codePaths, ["src/Button.tsx"]);
  assert.deepEqual(result.mergedPaths, ["src/Button.tsx"]);
});

test("已有 codePaths 含同路径 → 合并去重，不新增项", () => {
  const kb = emptyKb();
  kb.codeMap = [{ capability: "页面 Button", codePaths: ["src/Button.tsx"], tests: [] }];
  const result = mergeCodeRewriteIntoOntology(kb, [edit("src/Button.tsx")]);
  assert.equal(result.updatedKb.codeMap.length, 1);
  assert.deepEqual(result.updatedKb.codeMap[0].codePaths, ["src/Button.tsx"]);
  assert.equal(result.mergedPaths.length, 0, "已存在路径不再算新增");
});

test("已有 codePaths 是新路径的前缀目录 → 合并进已有项", () => {
  const kb = emptyKb();
  kb.codeMap = [{ capability: "页面 Button", codePaths: ["src/components/"], tests: [] }];
  const result = mergeCodeRewriteIntoOntology(kb, [edit("src/components/Button.tsx")]);
  assert.equal(result.updatedKb.codeMap.length, 1, "合并进已有项不新增");
  assert.deepEqual(result.updatedKb.codeMap[0].codePaths, ["src/components/", "src/components/Button.tsx"]);
  assert.deepEqual(result.mergedPaths, ["src/components/Button.tsx"]);
});

test("多个 edit 部分匹配部分新增", () => {
  const kb = emptyKb();
  kb.codeMap = [{ capability: "页面 A", codePaths: ["src/pages/A.tsx"], tests: [] }];
  const result = mergeCodeRewriteIntoOntology(kb, [
    edit("src/pages/A.tsx"),
    edit("src/pages/B.tsx"),
    edit("src/utils/helpers.ts"),
  ]);
  assert.equal(result.updatedKb.codeMap.length, 3);
  assert.deepEqual(result.mergedPaths, ["src/pages/B.tsx", "src/utils/helpers.ts"]);
});

test("不改原 KB（不可变）", () => {
  const kb = emptyKb();
  kb.codeMap = [{ capability: "x", codePaths: ["src/a.ts"], tests: [] }];
  const original = JSON.parse(JSON.stringify(kb));
  mergeCodeRewriteIntoOntology(kb, [edit("src/b.ts")]);
  assert.deepEqual(kb, original, "原 KB 不应被修改");
});

test("空 path 的 edit 被跳过", () => {
  const result = mergeCodeRewriteIntoOntology(emptyKb(), [edit("   "), edit("src/a.ts")]);
  assert.equal(result.updatedKb.codeMap.length, 1);
  assert.deepEqual(result.mergedPaths, ["src/a.ts"]);
});
