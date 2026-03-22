import test from "node:test";
import assert from "node:assert/strict";
import {
  createInMemoryWorkspaceRepo,
  createInMemoryOpenclawGlobalRepo,
  createMockAgentRunner,
  buildMinimalPolicyRecord,
  buildMinimalIteration
} from "./helpers/mock-factories.mjs";

const { OpenclawGlobalService } = await import("../dist/application/openclawGlobal/openclawGlobalService.js");
const { evaluatePolicyGateForCoachOp, getActiveProjectPolicyOp } = await import("../dist/application/workspace/workspaceServicePolicyOps.js");
const { buildUnifiedSkillRegistryOp } = await import("../dist/application/workspace/skillRegistry.js");
const { selectOpenclawSkillsFromRegistry } = await import("../dist/application/workspace/workspaceOpenclawSkillsBridge.js");
const { buildSkillPromptInjection } = await import("../dist/application/workspace/skillInjector.js");
const { extractKnowledgeBaseUpdateOp } = await import("../dist/application/workspace/ontologyService.js");
const { detectOntologyCollisionsOp } = await import("../dist/application/workspace/ontologyCollisionDetector.js");
const { buildGatewayProjectContext } = await import("../dist/application/workspace/openclawService.js");
const { buildKnowledgeSyncContext } = await import("../dist/application/workspace/knowledgeSyncService.js");

// ─── 场景1: 主窗口策略变更 → Coach 门禁感知 ───

test("chain-closure: main window policy change → coach gate aware", async () => {
  const globalRepo = createInMemoryOpenclawGlobalRepo();
  const workspaceRepo = createInMemoryWorkspaceRepo();

  const policyReply = '好的，跳过原型阶段。\n<!-- policy:{"action":"remove-stage","stage":"prototype"} -->';
  const agentRunner = createMockAgentRunner(policyReply);
  const service = new OpenclawGlobalService(globalRepo, agentRunner, workspaceRepo);

  const conv = service.createConversation("策略测试");
  await service.sendMessage(conv.id, "跳过原型阶段");

  // 验证策略已写入 workspace repo
  const activePolicy = getActiveProjectPolicyOp(workspaceRepo, 0);
  assert.ok(activePolicy, "should have active policy");
  assert.ok(!activePolicy.strategy.stages.includes("prototype"), "prototype should be removed");

  // Coach 门禁能感知此策略
  workspaceRepo._store.projects.push({ id: 1, name: "P" });
  const iter = buildMinimalIteration(1, { id: 10 });
  workspaceRepo._store.iterations.push(iter);
  const gateResult = evaluatePolicyGateForCoachOp(workspaceRepo, iter, "继续", activePolicy);
  assert.equal(typeof gateResult.blocked, "boolean");
});

// ─── 场景2: SkillRegistry 三源合一 → Coach prompt 含 SOP ───

test("chain-closure: three-source skill registry → prompt contains SOP", () => {
  const filePackSkills = [
    { id: "01-ontology-mapping", name: "本体映射", description: "desc", sopContent: "## 本体映射步骤\n1. 提取术语\n2. 建立关联" },
    { id: "10-business-rule-linking", name: "业务规则", description: "desc", sopContent: "## 规则链接步骤" }
  ];
  const globalSkills = [
    { id: "custom-audit", name: "自定义审计", description: "审计", content: "审计SOP正文", status: "active" }
  ];
  const policySkillsPlan = [];

  const registry = buildUnifiedSkillRegistryOp(filePackSkills, globalSkills, policySkillsPlan);
  assert.equal(registry.length, 3, "registry should have 3 skills");

  const selection = selectOpenclawSkillsFromRegistry({
    registrySkills: registry,
    userMessage: "检查业务规则",
    activeStage: ""
  });
  assert.ok(selection.selectedSkillEntries.length > 0, "should select skills");

  const injection = buildSkillPromptInjection(selection.selectedSkillEntries, {});
  assert.ok(injection.includes("[SKILL:"), "prompt should contain skill sections");
  assert.ok(injection.length > 0, "injection should have content");
});

// ─── 场景3: 分析完成 → KB 全字段 + 碰撞检测有值 ───

test("chain-closure: analysis → KB full fields + collision detection", () => {
  const emptyKb = {
    ontologyTerms: [{ term: "用户", aliases: [], definition: "注册用户", evidence: "v1" }],
    stableRules: [{ rule: "订单30分钟取消", rationale: "减库存", source: "v1" }],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };

  const analysisInput = {
    domainKnowledgeEntries: [
      { term: "用户", definition: "注册用户", mappedPages: ["/users"], mappedApis: ["/api/users"], mappedEntities: ["User"], mappedCodePaths: ["src/users"], evidence: "v2" },
      { term: "订单", definition: "核心实体", mappedPages: ["/orders"], mappedApis: ["/api/orders"], mappedEntities: ["Order"], mappedCodePaths: ["src/orders"], evidence: "v2" }
    ],
    traceabilityMap: {
      pages: [{ name: "订单", path: "/orders", components: ["OrderList"] }],
      apis: [{ path: "/api/orders", method: "POST", description: "创建订单" }],
      entities: [{ name: "Order", fields: ["id", "status"] }]
    },
    boundary: {
      codePaths: ["src/orders"],
      requirementRefs: ["REQ-001"],
      riskAreas: [{ risk: "并发", mitigation: "锁", trigger: "高峰" }]
    },
    analysisReport: null
  };

  const kbResult = extractKnowledgeBaseUpdateOp(emptyKb, analysisInput);
  assert.ok(kbResult.updatedKb.ontologyTerms.length >= 2, "KB ontologyTerms filled");
  assert.ok(kbResult.updatedKb.componentInventory.length > 0, "KB componentInventory filled");
  assert.ok(kbResult.updatedKb.codeMap.length > 0, "KB codeMap filled");
  assert.ok(kbResult.updatedKb.knownRisks.length > 0, "KB knownRisks filled");

  const collisions = detectOntologyCollisionsOp(emptyKb, analysisInput.domainKnowledgeEntries);
  assert.ok(collisions.knowledgeHits.length > 0, "should have knowledge hits");
});

// ─── 场景4: Gateway 对话含完整知识 + Binding agentId ───

test("chain-closure: gateway context includes full knowledge + binding", () => {
  const context = buildGatewayProjectContext({
    project: {
      name: "电商平台",
      description: "B2C电商系统",
      status: "active",
      knowledgeBase: {
        ontologyTerms: [{ term: "订单", aliases: ["Order"], definition: "交易实体", evidence: "" }],
        stableRules: [{ rule: "未支付自动取消", rationale: "", source: "" }],
        componentInventory: [{ component: "OrderList", responsibility: "列表", relatedRequirements: [], relatedCodePaths: [] }],
        codeMap: [],
        decisionLog: [],
        knownRisks: [{ risk: "并发", mitigation: "锁", trigger: "高峰" }],
        changePatterns: [],
        updatedAt: ""
      }
    },
    userMessage: "查看项目状态",
    binding: { openclawProfile: "project-1", agentId: "buildwise-agent", workspacePath: "/ws/p1" }
  });

  assert.ok(context.includes("电商平台"), "project name");
  assert.ok(context.includes("订单"), "KB terms");
  assert.ok(context.includes("未支付自动取消"), "KB rules");
  assert.ok(context.includes("OrderList"), "KB components");
  assert.ok(context.includes("buildwise-agent"), "binding agentId");

  // Knowledge sync 也应该能序列化
  const syncContext = buildKnowledgeSyncContext({
    ontologyTerms: [{ term: "订单", aliases: [], definition: "交易实体", evidence: "" }],
    stableRules: [{ rule: "未支付取消", rationale: "", source: "" }],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: ""
  });
  assert.ok(syncContext.includes("订单"), "sync context includes terms");
});
