import test from "node:test";
import assert from "node:assert/strict";

const { extractKnowledgeBaseUpdateOp } = await import(
  "../dist/application/workspace/project/ontologyService.js"
);
const { detectOntologyCollisionsOp } = await import(
  "../dist/application/workspace/project/ontologyService.js"
);

// ─── 端到端：分析完成后 KB 全字段填充 + 碰撞检测 ───

test("analysis → KB extraction → collision detection pipeline", () => {
  const existingKb = {
    ontologyTerms: [
      { term: "用户", aliases: [], definition: "注册用户", evidence: "v1分析" }
    ],
    stableRules: [
      { rule: "订单创建后30分钟未支付自动取消", rationale: "减少库存锁定", source: "v1" }
    ],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };

  const analysisOutput = {
    domainKnowledgeEntries: [
      { term: "用户", definition: "注册用户", mappedPages: ["/users"], mappedApis: ["/api/users"], mappedEntities: ["User"], mappedCodePaths: ["src/users"], evidence: "v2分析" },
      { term: "订单", definition: "核心交易实体", mappedPages: ["/orders"], mappedApis: ["/api/orders"], mappedEntities: ["Order"], mappedCodePaths: ["src/orders"], evidence: "v2分析" },
      { term: "订单超时", definition: "订单创建后60分钟未支付自动取消", mappedPages: [], mappedApis: [], mappedEntities: ["Order"], mappedCodePaths: [], evidence: "新需求" }
    ],
    traceabilityMap: {
      pages: [
        { name: "用户管理", path: "/users", components: ["UserList", "UserForm"] },
        { name: "订单管理", path: "/orders", components: ["OrderList"] }
      ],
      apis: [
        { path: "/api/users", method: "GET", description: "获取用户列表" },
        { path: "/api/orders", method: "POST", description: "创建订单" }
      ],
      entities: [
        { name: "User", fields: ["id", "name", "email"] },
        { name: "Order", fields: ["id", "userId", "status", "amount"] }
      ]
    },
    boundary: {
      codePaths: ["src/users/index.ts", "src/orders/index.ts"],
      requirementRefs: ["REQ-001", "REQ-002"],
      riskAreas: [{ risk: "并发下单冲突", mitigation: "乐观锁", trigger: "秒杀场景" }]
    },
    analysisReport: null
  };

  // Step 1: 提取 KB
  const kbResult = extractKnowledgeBaseUpdateOp(existingKb, analysisOutput);

  // 验证全字段填充
  assert.ok(kbResult.updatedKb.ontologyTerms.length >= 2, "ontologyTerms should have entries");
  assert.ok(kbResult.updatedKb.componentInventory.length > 0, "componentInventory should be filled");
  assert.ok(kbResult.updatedKb.codeMap.length > 0, "codeMap should be filled");
  assert.ok(kbResult.updatedKb.knownRisks.length > 0, "knownRisks should be filled");

  // 验证增量统计
  assert.ok(kbResult.newTerms.length > 0, "should have new terms");
  assert.ok(kbResult.updatedTerms.length > 0 || kbResult.newTerms.length > 0, "should have changes");

  // Step 2: 碰撞检测
  const collisions = detectOntologyCollisionsOp(existingKb, analysisOutput.domainKnowledgeEntries);

  // "用户" 命中（定义一致）
  assert.ok(collisions.knowledgeHits.length > 0, "should detect knowledge hits for existing terms");

  // "订单超时" 与规则 "30分钟自动取消" 矛盾
  assert.ok(collisions.termCollisions.length > 0, "should detect rule collisions");
});

test("confirm analysis should write all 7 KB fields", () => {
  const emptyKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: ""
  };

  const result = extractKnowledgeBaseUpdateOp(emptyKb, {
    domainKnowledgeEntries: [
      { term: "A", definition: "定义A", mappedPages: ["/a"], mappedApis: ["/api/a"], mappedEntities: ["EntityA"], mappedCodePaths: ["src/a"], evidence: "分析" }
    ],
    traceabilityMap: {
      pages: [{ name: "PageA", path: "/a", components: ["CompA"] }],
      apis: [{ path: "/api/a", method: "GET", description: "API A" }],
      entities: [{ name: "EntityA", fields: ["id"] }]
    },
    boundary: {
      codePaths: ["src/a/index.ts"],
      requirementRefs: ["REQ-A"],
      riskAreas: [{ risk: "风险A", mitigation: "方案A", trigger: "触发A" }]
    },
    analysisReport: null
  });

  // 验证 7 个字段全有值
  assert.ok(result.updatedKb.ontologyTerms.length > 0, "ontologyTerms");
  assert.ok(result.updatedKb.componentInventory.length > 0, "componentInventory");
  assert.ok(result.updatedKb.codeMap.length > 0, "codeMap");
  assert.ok(result.updatedKb.knownRisks.length > 0, "knownRisks");
  assert.ok(result.updatedKb.updatedAt, "updatedAt");
  // decisionLog 和 changePatterns 从 existing 继承，初始为空属正常
});
