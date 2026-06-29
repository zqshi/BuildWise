import test from "node:test";
import assert from "node:assert/strict";
const { ContinuousModelingService } = await import("../dist/application/continuousModeling/continuousModelingService.js");
const { ContinuousModelingWorkspaceService } = await import("../dist/application/continuousModeling/continuousModelingWorkspaceService.js");
const { buildProjectModelView } = await import("../dist/application/continuousModeling/continuousModelingProjectView.js");
import { createInMemoryWorkspaceRepo, createInMemoryModelingRepo } from "./helpers/mock-factories.mjs";

function createWorkspaceRepository() {
  const repo = createInMemoryWorkspaceRepo();
  repo._store.projects.push({
    id: 11,
    name: "统一建模项目",
    description: "测试统一模型视图",
    status: "in-progress",
    repository: {
      id: "repo-11",
      repoMode: "hybrid",
      provider: "github",
      organization: "buildwise",
      name: "unified-model-project",
      url: "https://github.com/buildwise/unified-model-project",
      defaultBranch: "main",
      structureVersion: "v1",
      layout: [],
      governance: {
        requireRemoteForProduction: true,
        requireRemoteForStaging: false
      },
      health: {
        remoteConfigured: true,
        remoteReachable: false,
        remoteSynced: false,
        lastCheckedAt: "",
        lastError: ""
      },
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-17T00:00:00.000Z"
    },
    knowledgeBase: {
      ontologyTerms: [
        {
          term: "客户档案",
          aliases: ["客户"],
          definition: "客户主数据档案。",
          evidence: "kb"
        }
      ],
      stableRules: [
        {
          rule: "客户档案必须唯一",
          rationale: "避免重复建档",
          source: "kb"
        }
      ],
      componentInventory: [],
      codeMap: [],
      decisionLog: [
        {
          decision: "客户统一归口管理",
          status: "active",
          rationale: "减少重复维护",
          iterationVersion: "1.0.0"
        }
      ],
      knownRisks: [
        {
          risk: "客户口径不统一",
          mitigation: "统一术语",
          trigger: "新增需求"
        }
      ],
      changePatterns: [],
      updatedAt: "2026-03-17T00:00:00.000Z"
    }
  });
  repo._store.iterations.push({
    id: 21,
    projectId: 11,
    version: "1.1.0",
    name: "客户档案增量建模",
    description: "新增客户标签能力",
    goals: ["新增客户标签"],
    modules: [],
    status: "in-progress",
    progress: 35,
    createdAt: "2026-03-17",
    createdBy: "系统",
    current: true,
    aiSummary: "",
    scope: {
      inScope: ["新增客户标签"],
      outOfScope: [],
      acceptanceCriteria: ["标签可追溯"]
    },
    continuity: {
      inheritedFromIterationId: null,
      inheritedSummary: "",
      carriedGoals: [],
      carriedRisks: [],
      carriedDecisions: []
    },
    assessment: {
      baselineIterationId: null,
      baselineIterationName: "",
      currentSummary: "",
      deltaInScope: [],
      resolvedItems: [],
      pendingItems: [],
      risks: []
    }
  });
  return repo;
}

function createModelingRepository() {
  return {
    listSnapshots(projectId) {
      assert.equal(projectId, 11);
      return [
        {
          id: "snapshot-11-21-candidate",
          projectId: 11,
          iterationId: 21,
          version: "11.21.candidate",
          status: "candidate",
          ontologyTerms: [
            {
              canonicalTerm: "客户标签",
              aliases: ["标签"],
              technicalAliases: ["customer-tag"],
              definition: "客户标签模型。",
              evidence: ["snapshot"]
            }
          ],
          entities: [
            {
              id: "entity_customer_tag",
              name: "CustomerTag",
              businessName: "客户标签",
              fields: [{ name: "name", type: "string", required: true }]
            }
          ],
          relations: [],
          rules: [
            {
              id: "rule-tag-trace",
              name: "客户标签变更必须留痕",
              statement: "客户标签变更必须留痕",
              linkedEntityIds: ["entity_customer_tag"],
              linkedSurfaceIds: [],
              linkedApiIds: []
            }
          ],
          reviewTasks: [
            {
              id: "review-1",
              type: "rule_confirmation",
              title: "确认客户标签留痕规则",
              description: "确认业务规则口径",
              blocking: true
            }
          ],
          derivedFromSnapshotId: null,
          createdAt: "2026-03-17T08:00:00.000Z"
        }
      ];
    },
    getLatestPublishedSnapshot() {
      return null;
    },
    saveCandidateSnapshot() {}
  };
}

test("ContinuousModelingWorkspaceService validates project and iteration before planning", () => {
  const workspaceRepo = createWorkspaceRepository();
  const modelingRepo = createModelingRepository();
  const service = new ContinuousModelingWorkspaceService(new ContinuousModelingService(modelingRepo), workspaceRepo, modelingRepo);

  const missingProject = service.planIterationModeling({
    projectId: 999,
    iterationId: 21,
    baselineSnapshot: null,
    businessInputs: [],
    ontologyTerms: [],
    entities: [],
    relations: [],
    rules: []
  });
  assert.equal(missingProject.ok, false);
  if (missingProject.ok) {
    return;
  }
  assert.equal(missingProject.reason, "project_not_found");

  const missingIteration = service.planIterationModeling({
    projectId: 11,
    iterationId: 999,
    baselineSnapshot: null,
    businessInputs: [],
    ontologyTerms: [],
    entities: [],
    relations: [],
    rules: []
  });
  assert.equal(missingIteration.ok, false);
  if (missingIteration.ok) {
    return;
  }
  assert.equal(missingIteration.reason, "iteration_not_found");
});

test("ContinuousModelingWorkspaceService builds compatibility summary from unified model view", () => {
  const workspaceRepo = createWorkspaceRepository();
  const modelingRepo = createModelingRepository();
  const service = new ContinuousModelingWorkspaceService(new ContinuousModelingService(modelingRepo), workspaceRepo, modelingRepo);

  const summary = service.buildCompatibilityBusinessSummary(11, 21);

  assert.equal(summary?.source, "model-view-compat");
  assert.equal(summary?.model, "project_model_view");
  assert.match(summary?.summary || "", /候选模型快照/);
  assert(summary?.focus.some((item) => item.includes("关键术语")), "compat summary should include ontology focus");
  assert(summary?.risks.some((item) => item.includes("阻断型")), "compat summary should include blocking review risk");
});

test("buildProjectModelView merges project knowledge and latest snapshot into one unified context", () => {
  const workspaceRepo = createWorkspaceRepository();
  const modelingRepo = createModelingRepository();

  const view = buildProjectModelView(workspaceRepo, modelingRepo, 11, 21);
  assert.ok(view);
  if (!view) {
    return;
  }
  assert.equal(view.projectName, "统一建模项目");
  assert.equal(view.iterationName, "客户档案增量建模");
  assert.equal(view.latestSnapshotId, "snapshot-11-21-candidate");
  assert.ok(view.ontologyTerms.some((item) => item.businessTerm === "客户档案"));
  assert.ok(view.ontologyTerms.some((item) => item.businessTerm === "客户标签"));
  assert.ok(view.rules.some((item) => item.name === "客户档案必须唯一"));
  assert.ok(view.rules.some((item) => item.name === "客户标签变更必须留痕"));
  assert.ok(view.entities.some((item) => Array.isArray(item.fields)));
  assert.ok(view.rules.some((item) => Array.isArray(item.linkedEntityIds)));
  assert.equal(view.reviewTasks.length, 1);
});

// ─── saveCandidate diff + publishSnapshot KB writeback ───

function setupInMemory() {
  const workspaceRepo = createInMemoryWorkspaceRepo();
  const modelingRepo = createInMemoryModelingRepo();
  const modelingService = new ContinuousModelingService(modelingRepo);
  const service = new ContinuousModelingWorkspaceService(modelingService, workspaceRepo, modelingRepo);

  workspaceRepo._store.projects.push({
    id: 1, name: "测试项目", description: "", status: "active",
    knowledgeBase: {
      ontologyTerms: [{ term: "用户", aliases: [], definition: "平台用户", evidence: "v1" }],
      stableRules: [{ rule: "密码至少8位", rationale: "安全", source: "v1" }],
      componentInventory: [],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [],
      updatedAt: "2026-01-01"
    }
  });
  workspaceRepo._store.iterations.push({
    id: 10, projectId: 1, name: "迭代1", status: "planning",
    createdAt: "2026-01-01", updatedAt: "2026-01-01"
  });

  return { service, workspaceRepo, modelingRepo };
}

function buildTestInput(overrides = {}) {
  return {
    projectId: 1,
    iterationId: 10,
    baselineSnapshot: null,
    businessInputs: ["用户注册"],
    ontologyTerms: [
      { canonicalTerm: "用户", aliases: [], technicalAliases: ["User"], definition: "平台用户", evidence: ["v1"] },
      { canonicalTerm: "订单", aliases: [], technicalAliases: ["Order"], definition: "交易实体", evidence: ["v2"] }
    ],
    entities: [
      { id: "e1", name: "User", businessName: "用户", fields: [{ name: "id", type: "string", required: true }] }
    ],
    relations: [],
    rules: [
      { id: "r1", name: "密码规则", statement: "密码至少8位", linkedEntityIds: ["e1"], linkedSurfaceIds: [], linkedApiIds: [] }
    ],
    ...overrides
  };
}

test("saveCandidate returns diff summary against empty baseline", () => {
  const { service } = setupInMemory();
  const result = service.saveCandidate(buildTestInput());
  assert.equal(result.ok, true);
  assert.ok(result.diff);
  assert.ok(result.diff.summary.length > 0);
  assert.equal(result.diff.previousSnapshotId, null);
  assert.equal(result.diff.addedTerms.length, 2);
  assert.equal(result.diff.addedEntities.length, 1);
  assert.equal(result.diff.addedRules.length, 1);
});

test("saveCandidate diff detects changes against published baseline", () => {
  const { service, modelingRepo } = setupInMemory();
  // 已发布基线（无阻断评审，聚焦 saveCandidate 的 diff 检测，不涉发布门禁）
  modelingRepo.saveCandidateSnapshot({
    id: "baseline-1-10", projectId: 1, iterationId: 10,
    version: "1.0", status: "published",
    ontologyTerms: [
      { canonicalTerm: "用户", aliases: [], technicalAliases: ["User"], definition: "平台用户", evidence: ["v1"] },
      { canonicalTerm: "订单", aliases: [], technicalAliases: ["Order"], definition: "交易实体", evidence: ["v2"] }
    ],
    entities: [{ id: "e1", name: "User", businessName: "用户", fields: [{ name: "id", type: "string", required: true }] }],
    relations: [], rules: [],
    reviewTasks: [], derivedFromSnapshotId: null, createdAt: "2026-01-01T00:00:00.000Z"
  });

  const second = service.saveCandidate(buildTestInput({
    ontologyTerms: [
      { canonicalTerm: "用户", aliases: [], technicalAliases: ["User"], definition: "平台用户", evidence: ["v1"] },
      { canonicalTerm: "订单", aliases: [], technicalAliases: ["Order"], definition: "交易实体", evidence: ["v2"] },
      { canonicalTerm: "退款", aliases: [], technicalAliases: ["Refund"], definition: "退款操作", evidence: ["v3"] }
    ]
  }));
  assert.ok(second.ok);
  assert.ok(second.diff.previousSnapshotId);
  assert.equal(second.diff.addedTerms.length, 1);
  assert.ok(second.diff.addedTerms.includes("退款"));
});

test("publishSnapshot syncs snapshot data back to project KB", () => {
  const { service, workspaceRepo, modelingRepo } = setupInMemory();
  // 候选快照无阻断评审（聚焦 publish 的 KB 回写，不涉发布门禁）
  modelingRepo.saveCandidateSnapshot({
    id: "snap-kb-1-10", projectId: 1, iterationId: 10,
    version: "1.0", status: "candidate",
    ontologyTerms: [
      { canonicalTerm: "用户", aliases: [], technicalAliases: ["User"], definition: "平台用户", evidence: ["v1"] },
      { canonicalTerm: "订单", aliases: [], technicalAliases: ["Order"], definition: "交易实体", evidence: ["v2"] }
    ],
    entities: [
      { id: "e1", name: "User", businessName: "用户", fields: [] },
      { id: "e2", name: "Order", businessName: "订单", fields: [] }
    ],
    relations: [],
    rules: [
      { id: "r1", name: "密码规则", statement: "密码至少8位", linkedEntityIds: ["e1"], linkedSurfaceIds: [], linkedApiIds: [] },
      { id: "r2", name: "订单规则", statement: "订单30分钟取消", linkedEntityIds: ["e2"], linkedSurfaceIds: [], linkedApiIds: [] }
    ],
    reviewTasks: [], derivedFromSnapshotId: null, createdAt: "2026-01-01T00:00:00.000Z"
  });

  const pubResult = service.publishSnapshot("snap-kb-1-10", 1);
  assert.ok(pubResult.ok);

  const project = workspaceRepo.findProject(1);
  const kb = project.knowledgeBase;
  assert.ok(kb.ontologyTerms.some(t => t.term === "订单"), "KB should include 订单");
  assert.ok(kb.stableRules.some(r => r.rule === "订单30分钟取消"), "KB should include new rule");
  assert.ok(kb.componentInventory.some(c => c.component === "Order"), "KB should include Order");
});

test("publishSnapshot does not duplicate existing KB entries", () => {
  const { service, workspaceRepo, modelingRepo } = setupInMemory();
  // 候选快照含 KB 已有条目且无阻断评审（聚焦 publish 回写去重，不涉发布门禁）
  modelingRepo.saveCandidateSnapshot({
    id: "snap-dedup-1-10", projectId: 1, iterationId: 10,
    version: "1.0", status: "candidate",
    ontologyTerms: [{ canonicalTerm: "用户", aliases: [], technicalAliases: ["User"], definition: "平台用户", evidence: ["v1"] }],
    entities: [{ id: "e1", name: "User", businessName: "用户", fields: [] }],
    relations: [],
    rules: [{ id: "r1", name: "密码规则", statement: "密码至少8位", linkedEntityIds: ["e1"], linkedSurfaceIds: [], linkedApiIds: [] }],
    reviewTasks: [], derivedFromSnapshotId: null, createdAt: "2026-01-01T00:00:00.000Z"
  });

  service.publishSnapshot("snap-dedup-1-10", 1);

  const project = workspaceRepo.findProject(1);
  const kb = project.knowledgeBase;
  assert.equal(kb.ontologyTerms.filter(t => t.term === "用户").length, 1);
  assert.equal(kb.stableRules.filter(r => r.rule === "密码至少8位").length, 1);
});
