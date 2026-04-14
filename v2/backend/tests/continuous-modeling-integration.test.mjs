import test from "node:test";
import assert from "node:assert/strict";

const { buildModelingInputFromAnalysis } = await import(
  "../dist/application/workspace/project/ontologyModelingBridge.js"
);

// ─── 基本场景：从 KB + 分析数据构建 IterationModelingInput ───

test("builds IterationModelingInput from KB and domain entries", () => {
  const input = buildModelingInputFromAnalysis({
    projectId: 1,
    iterationId: 10,
    knowledgeBase: {
      ontologyTerms: [{ term: "用户", aliases: ["User"], definition: "注册用户", evidence: "v1" }],
      stableRules: [{ rule: "未支付订单30分钟取消", rationale: "减库存", source: "v1" }],
      componentInventory: [],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: "2026-01-01"
    },
    domainKnowledgeEntries: [
      { term: "订单", definition: "交易实体", mappedPages: ["/orders"], mappedApis: ["/api/orders"], mappedEntities: ["Order"], mappedCodePaths: ["src/orders"], evidence: "分析" }
    ],
    traceabilityMap: {
      pages: [{ name: "订单", path: "/orders", components: ["OrderList"] }],
      apis: [{ path: "/api/orders", method: "POST", description: "创建订单" }],
      entities: [{ name: "Order", fields: ["id", "status"] }]
    }
  });

  assert.equal(input.projectId, 1);
  assert.equal(input.iterationId, 10);
  assert.ok(input.ontologyTerms.length >= 1, "should have ontology terms");
  assert.ok(input.entities.length >= 1, "should have entities");
  assert.ok(input.rules.length >= 1, "should have rules");
});

test("converts KB ontologyTerms to ContinuousModeling OntologyTerm format", () => {
  const input = buildModelingInputFromAnalysis({
    projectId: 1,
    iterationId: 10,
    knowledgeBase: {
      ontologyTerms: [{ term: "用户", aliases: ["User", "Member"], definition: "平台用户", evidence: "分析" }],
      stableRules: [],
      componentInventory: [],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: ""
    },
    domainKnowledgeEntries: [],
    traceabilityMap: null
  });

  assert.equal(input.ontologyTerms[0].canonicalTerm, "用户");
  assert.deepEqual(input.ontologyTerms[0].aliases, ["User", "Member"]);
});

test("builds BusinessRule with linkedEntityIds from mapped entities", () => {
  const input = buildModelingInputFromAnalysis({
    projectId: 1,
    iterationId: 10,
    knowledgeBase: {
      ontologyTerms: [],
      stableRules: [{ rule: "订单30分钟取消", rationale: "减库存", source: "v1" }],
      componentInventory: [],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: ""
    },
    domainKnowledgeEntries: [
      { term: "订单超时", definition: "自动取消", mappedPages: [], mappedApis: ["/api/orders"], mappedEntities: ["Order"], mappedCodePaths: [], evidence: "" }
    ],
    traceabilityMap: {
      pages: [{ name: "订单", path: "/orders", components: [] }],
      apis: [{ path: "/api/orders", method: "POST", description: "创建订单" }],
      entities: [{ name: "Order", fields: ["id", "status"] }]
    }
  });

  const orderRule = input.rules.find((r) => r.statement.includes("取消"));
  assert.ok(orderRule, "should have a cancel rule");
  // linkedEntityIds 应该从 traceabilityMap.entities 中关联
  assert.ok(input.entities.some((e) => e.name === "Order"), "should have Order entity");
});

// ─── 从 KB.componentInventory 生成 BusinessEntity ───

test("generates entities from KB componentInventory when traceabilityMap has no entities", () => {
  const input = buildModelingInputFromAnalysis({
    projectId: 1,
    iterationId: 10,
    knowledgeBase: {
      ontologyTerms: [],
      stableRules: [],
      componentInventory: [
        { component: "退款申请页", responsibility: "承接退款申请与校验", relatedRequirements: ["refund-window"], relatedCodePaths: ["src/refund/apply.tsx"] },
        { component: "订单详情页", responsibility: "展示订单详情", relatedRequirements: ["order-detail"], relatedCodePaths: ["src/order/detail.tsx"] }
      ],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: ""
    },
    domainKnowledgeEntries: [],
    traceabilityMap: null
  });

  assert.ok(input.entities.length >= 2, `should have at least 2 entities from componentInventory, got ${input.entities.length}`);
  assert.ok(input.entities.some(e => e.businessName.includes("退款申请页")));
  assert.ok(input.entities.some(e => e.businessName.includes("订单详情页")));
});

test("merges entities from both traceabilityMap and componentInventory without duplicates", () => {
  const input = buildModelingInputFromAnalysis({
    projectId: 1,
    iterationId: 10,
    knowledgeBase: {
      ontologyTerms: [],
      stableRules: [],
      componentInventory: [
        { component: "Order", responsibility: "订单实体", relatedRequirements: [], relatedCodePaths: [] },
        { component: "退款页", responsibility: "退款", relatedRequirements: [], relatedCodePaths: [] }
      ],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: ""
    },
    domainKnowledgeEntries: [],
    traceabilityMap: {
      pages: [],
      apis: [],
      entities: [{ name: "Order", fields: ["id", "status"] }]
    }
  });

  // Order 应该只出现一次（来自 traceabilityMap），退款页 作为额外 entity
  const orderEntities = input.entities.filter(e => e.name === "Order");
  assert.equal(orderEntities.length, 1, "Order should not be duplicated");
  assert.ok(input.entities.length >= 2, "should have Order + 退款页");
});

test("returns empty arrays when no data available", () => {
  const input = buildModelingInputFromAnalysis({
    projectId: 1,
    iterationId: 10,
    knowledgeBase: {
      ontologyTerms: [],
      stableRules: [],
      componentInventory: [],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: ""
    },
    domainKnowledgeEntries: [],
    traceabilityMap: null
  });

  assert.equal(input.ontologyTerms.length, 0);
  assert.equal(input.entities.length, 0);
  assert.equal(input.rules.length, 0);
  assert.equal(input.relations.length, 0);
});
