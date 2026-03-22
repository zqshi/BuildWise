import test from "node:test";
import assert from "node:assert/strict";

const { extractKnowledgeBaseUpdateOp } = await import(
  "../dist/application/workspace/ontologyService.js"
);

// ─── 空输入 ───

test("returns unchanged KB when input has no entries", () => {
  const existingKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [],
    traceabilityMap: null,
    boundary: null,
    analysisReport: null
  });
  assert.equal(result.updatedKb.ontologyTerms.length, 0);
  assert.equal(result.newTerms.length, 0);
});

// ─── 从 domainKnowledgeEntries 提取 ontologyTerms ───

test("extracts ontologyTerms from domainKnowledgeEntries", () => {
  const existingKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [
      { term: "订单", definition: "用户购买行为的核心实体", mappedPages: ["/orders"], mappedApis: ["/api/orders"], mappedEntities: ["Order"], mappedCodePaths: ["src/orders"], evidence: "来自分析" }
    ],
    traceabilityMap: null,
    boundary: null,
    analysisReport: null
  });
  assert.equal(result.updatedKb.ontologyTerms.length, 1);
  assert.equal(result.updatedKb.ontologyTerms[0].term, "订单");
  assert.equal(result.newTerms.length, 1);
});

// ─── 去重：已存在的 term 不重复添加 ───

test("deduplicates existing ontologyTerms", () => {
  const existingKb = {
    ontologyTerms: [{ term: "订单", aliases: [], definition: "已有定义", evidence: "旧" }],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [
      { term: "订单", definition: "新定义", mappedPages: [], mappedApis: [], mappedEntities: [], mappedCodePaths: [], evidence: "新" }
    ],
    traceabilityMap: null,
    boundary: null,
    analysisReport: null
  });
  assert.equal(result.updatedKb.ontologyTerms.length, 1);
  assert.equal(result.updatedKb.ontologyTerms[0].definition, "新定义");
  assert.equal(result.newTerms.length, 0);
  assert.equal(result.updatedTerms.length, 1);
});

// ─── 从 traceabilityMap 提取 componentInventory 和 codeMap ───

test("extracts componentInventory from traceabilityMap", () => {
  const existingKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [],
    traceabilityMap: {
      pages: [{ name: "订单列表", path: "/orders", components: ["OrderList", "OrderFilter"] }],
      apis: [{ path: "/api/orders", method: "GET", description: "获取订单列表" }],
      entities: [{ name: "Order", fields: ["id", "status", "amount"] }]
    },
    boundary: null,
    analysisReport: null
  });
  assert.ok(result.updatedKb.componentInventory.length > 0);
  assert.ok(result.updatedKb.componentInventory[0].component.includes("OrderList") || result.updatedKb.componentInventory[0].component.includes("订单"));
});

test("extracts codeMap from traceabilityMap", () => {
  const existingKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [],
    traceabilityMap: {
      pages: [{ name: "订单", path: "/orders", components: ["OrderList"] }],
      apis: [{ path: "/api/orders", method: "GET", description: "订单API" }],
      entities: []
    },
    boundary: { codePaths: ["src/orders/index.ts"], requirementRefs: ["REQ-001"] },
    analysisReport: null
  });
  assert.ok(result.updatedKb.codeMap.length > 0);
});

// ─── 从 boundary 提取 knownRisks ───

test("extracts knownRisks from boundary riskAreas if present", () => {
  const existingKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [],
    traceabilityMap: null,
    boundary: {
      codePaths: [],
      requirementRefs: [],
      riskAreas: [{ risk: "并发冲突", mitigation: "乐观锁", trigger: "多用户同时修改" }]
    },
    analysisReport: null
  });
  assert.equal(result.updatedKb.knownRisks.length, 1);
  assert.equal(result.updatedKb.knownRisks[0].risk, "并发冲突");
});
