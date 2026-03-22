import test from "node:test";
import assert from "node:assert/strict";

const { buildKnowledgeSyncContext } = await import(
  "../dist/application/workspace/knowledgeSyncService.js"
);

test("returns empty context for null KB", () => {
  const result = buildKnowledgeSyncContext(null);
  assert.equal(result, "");
});

test("serializes KB terms and rules into structured text", () => {
  const kb = {
    ontologyTerms: [
      { term: "订单", aliases: ["Order"], definition: "核心交易实体", evidence: "分析" }
    ],
    stableRules: [
      { rule: "未支付30分钟取消", rationale: "减库存", source: "v1" }
    ],
    componentInventory: [
      { component: "OrderList", responsibility: "订单列表", relatedRequirements: [], relatedCodePaths: [] }
    ],
    codeMap: [
      { capability: "GET /api/orders", codePaths: ["src/orders"], tests: [] }
    ],
    decisionLog: [],
    knownRisks: [
      { risk: "并发冲突", mitigation: "乐观锁", trigger: "多用户" }
    ],
    changePatterns: [],
    updatedAt: "2026-03-22"
  };
  const result = buildKnowledgeSyncContext(kb);
  assert.ok(result.includes("订单"), "should include term");
  assert.ok(result.includes("未支付30分钟取消"), "should include rule");
  assert.ok(result.includes("OrderList"), "should include component");
  assert.ok(result.includes("并发冲突"), "should include risk");
});

test("limits output length", () => {
  const kb = {
    ontologyTerms: Array.from({ length: 50 }, (_, i) => ({
      term: `术语${i}`,
      aliases: [],
      definition: "x".repeat(200),
      evidence: ""
    })),
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: ""
  };
  const result = buildKnowledgeSyncContext(kb, { maxChars: 2000 });
  assert.ok(result.length <= 2100);
});
