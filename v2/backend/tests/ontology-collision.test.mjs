import test from "node:test";
import assert from "node:assert/strict";

const { detectOntologyCollisionsOp } = await import(
  "../dist/application/workspace/ontologyCollisionDetector.js"
);

const makeKb = (terms = [], rules = []) => ({
  ontologyTerms: terms,
  stableRules: rules,
  componentInventory: [],
  codeMap: [],
  decisionLog: [],
  knownRisks: [],
  changePatterns: [],
  updatedAt: "2026-01-01"
});

// ─── 无冲突 ───

test("returns empty collisions when no conflicts", () => {
  const kb = makeKb();
  const newEntries = [
    { term: "订单", definition: "核心业务实体", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "" }
  ];
  const result = detectOntologyCollisionsOp(kb, newEntries);
  assert.equal(result.knowledgeHits.length, 0);
  assert.equal(result.knowledgeConflicts.length, 0);
  assert.equal(result.termCollisions.length, 0);
});

// ─── 术语命中 ───

test("detects knowledge hits when term already exists", () => {
  const kb = makeKb([{ term: "订单", aliases: [], definition: "已有定义", evidence: "旧" }]);
  const newEntries = [
    { term: "订单", definition: "已有定义", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "" }
  ];
  const result = detectOntologyCollisionsOp(kb, newEntries);
  assert.equal(result.knowledgeHits.length, 1);
  assert.ok(result.knowledgeHits[0].includes("订单"));
});

// ─── 术语定义冲突 ───

test("detects knowledge conflicts when definition differs", () => {
  const kb = makeKb([{ term: "订单", aliases: [], definition: "旧定义", evidence: "旧" }]);
  const newEntries = [
    { term: "订单", definition: "完全不同的新定义", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "" }
  ];
  const result = detectOntologyCollisionsOp(kb, newEntries);
  assert.equal(result.knowledgeConflicts.length, 1);
  assert.ok(result.knowledgeConflicts[0].includes("订单"));
});

// ─── 规则冲突 ───

test("detects rule collision when existing rule contradicts", () => {
  const kb = makeKb(
    [],
    [{ rule: "订单创建后30分钟未支付自动取消", rationale: "减少库存锁定", source: "v1" }]
  );
  const newEntries = [
    { term: "订单超时", definition: "订单创建后60分钟未支付自动取消", mappedPages: [], mappedApis: [], mappedEntities: ["Order"], mappedCodePaths: [], evidence: "新需求" }
  ];
  const result = detectOntologyCollisionsOp(kb, newEntries);
  assert.equal(result.termCollisions.length, 1);
  assert.ok(result.termCollisions[0].existingRule.includes("30分钟"));
  assert.ok(result.termCollisions[0].newDefinition.includes("60分钟"));
});

// ─── 多条目混合 ───

test("handles mix of new, hit, and conflict entries", () => {
  const kb = makeKb([
    { term: "用户", aliases: [], definition: "注册用户", evidence: "" },
    { term: "地址", aliases: [], definition: "收货地址", evidence: "" }
  ]);
  const newEntries = [
    { term: "用户", definition: "注册用户", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "" },
    { term: "地址", definition: "与旧定义不同的新地址含义", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "" },
    { term: "支付", definition: "全新术语", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "" }
  ];
  const result = detectOntologyCollisionsOp(kb, newEntries);
  assert.equal(result.knowledgeHits.length, 1); // 用户命中
  assert.equal(result.knowledgeConflicts.length, 1); // 地址冲突
});
