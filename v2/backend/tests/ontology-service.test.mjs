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

// ─── 从 analysisReport 提取 decisionLog ───

test("extracts decisionLog from analysisReport.businessConfirmation.necessityAssessment", () => {
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
    analysisReport: {
      businessConfirmation: {
        necessityAssessment: {
          mustDo: ["登录功能必须双因素认证"],
          shouldDo: ["增加密码强度校验"],
          canDefer: ["社交登录集成"],
          outOfScope: ["企业SSO"],
          rationale: "安全优先"
        }
      }
    }
  });
  assert.equal(result.updatedKb.decisionLog.length, 3);
  const mustDoEntry = result.updatedKb.decisionLog.find(d => d.decision === "登录功能必须双因素认证");
  assert.ok(mustDoEntry);
  assert.equal(mustDoEntry.status, "active");
  assert.match(mustDoEntry.rationale, /mustDo/);
});

test("merges decisionLog with existing entries without duplicates", () => {
  const existingKb = {
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [{ decision: "登录功能必须双因素认证", status: "active", rationale: "旧版", iterationVersion: "v1" }],
    knownRisks: [],
    changePatterns: [],
    updatedAt: "2026-01-01"
  };
  const result = extractKnowledgeBaseUpdateOp(existingKb, {
    domainKnowledgeEntries: [],
    traceabilityMap: null,
    boundary: null,
    analysisReport: {
      businessConfirmation: {
        necessityAssessment: {
          mustDo: ["登录功能必须双因素认证", "新增审计日志"],
          shouldDo: [],
          canDefer: [],
          outOfScope: [],
          rationale: "安全优先"
        }
      }
    }
  });
  // 已有的不重复，新增的追加
  assert.equal(result.updatedKb.decisionLog.length, 2);
});

// ─── 从 analysisReport 提取 changePatterns ───

test("extracts changePatterns from analysisReport.domainKnowledge.rules and versionDiffDetailed", () => {
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
    analysisReport: {
      domainKnowledge: {
        rules: ["先确认规则再改代码", "接口变更必须同步文档"],
        unknowns: []
      },
      versionDiffDetailed: {
        summary: "售后规则调整",
        impactScope: ["退款模块"],
        riskPoints: ["退款窗口放宽"],
        added: [{ dimension: "接口", item: "退款查询API", impact: "新增查询能力", risk: "low" }],
        changed: [{ dimension: "规则", item: "退款窗口", impact: "从7天改为15天", risk: "high" }],
        removed: []
      }
    }
  });
  assert.ok(result.updatedKb.changePatterns.length > 0);
  // 从 rules 提取
  const rulePattern = result.updatedKb.changePatterns.find(p => p.pattern.includes("先确认规则"));
  assert.ok(rulePattern);
  // 从 versionDiffDetailed 的 high risk 变更提取
  const diffPattern = result.updatedKb.changePatterns.find(p => p.pattern.includes("退款窗口"));
  assert.ok(diffPattern);
});

test("extracts additional knownRisks from analysisReport.risks and releaseReview.rollback", () => {
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
    analysisReport: {
      risks: ["并发写入导致数据不一致", "第三方API超时"],
      releaseReview: {
        rollback: {
          shouldRollback: false,
          reason: "回滚需确认数据迁移状态",
          trigger: "核心指标下降5%",
          actions: ["停止新请求", "切换数据源"]
        }
      }
    }
  });
  assert.ok(result.updatedKb.knownRisks.length >= 2);
  assert.ok(result.updatedKb.knownRisks.some(r => r.risk.includes("并发写入")));
  assert.ok(result.updatedKb.knownRisks.some(r => r.risk.includes("第三方API")));
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
