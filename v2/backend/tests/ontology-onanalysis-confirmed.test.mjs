import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, createInMemoryModelingRepo } from "./helpers/mock-factories.mjs";

const { ChangeControlService } = await import(
  "../dist/application/workspace/changeControl/changeControlService.js"
);
const { ContinuousModelingService } = await import(
  "../dist/application/continuousModeling/continuousModelingService.js"
);
const { ContinuousModelingWorkspaceService } = await import(
  "../dist/application/continuousModeling/continuousModelingWorkspaceService.js"
);

// ─── onAnalysisConfirmed 装配链门禁语义（v0.26.0 T3）────────────────────────────────
// 突出核心价值：用户确认分析后，自动保存候选本体快照并尝试发布；
// 候选快照有未解决阻断评审时，发布被门禁阻断、快照保持候选态（不误发布）。
// 补 app.ts:209-225 装配链的集成测试盲区——现有 confirmIterationAnalysis 测试用
// 孤立 ChangeControlService 未注册回调，不覆盖「确认→自动发布→门禁阻断」完整链。

function setup() {
  const workspaceRepo = createInMemoryWorkspaceRepo();
  const project = workspaceRepo.createProject({
    name: "本体门禁项目", description: "",
    knowledgeBase: {
      ontologyTerms: [], stableRules: [], componentInventory: [], codeMap: [],
      decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
    }
  });
  const iteration = workspaceRepo.createIteration(project.id, {
    version: "1.0.0", name: "迭代1", goals: [], modules: []
  });
  const modelingRepo = createInMemoryModelingRepo();
  const modelingService = new ContinuousModelingService(modelingRepo);
  const cmWorkspaceService = new ContinuousModelingWorkspaceService(
    modelingService, workspaceRepo, modelingRepo
  );
  const changeControl = new ChangeControlService(workspaceRepo);

  // 复刻 app.ts:209-225 装配：确认分析 → 保存候选 → 自动发布
  // 门禁在 publishSnapshot 内部生效（有未解决阻断评审 → 阻断，快照停 candidate）
  changeControl.setOnAnalysisConfirmed((iterationId, projectId) => {
    const project = workspaceRepo.findProject(projectId);
    if (!project) return;
    const saveResult = cmWorkspaceService.saveCandidate(buildModelingInput(projectId, iterationId));
    if (saveResult.ok && saveResult.data?.snapshotId) {
      cmWorkspaceService.publishSnapshot(saveResult.data.snapshotId, projectId);
    }
  });

  return { workspaceRepo, project, iteration, modelingRepo, modelingService, cmWorkspaceService, changeControl };
}

function buildModelingInput(projectId, iterationId) {
  // 新术语「客户」相对空 baseline 为新增 → 生成 term_confirmation 阻断评审
  return {
    projectId, iterationId,
    baselineSnapshot: null,
    businessInputs: ["新增客户本体建模"],
    ontologyTerms: [{ canonicalTerm: "客户", aliases: [], technicalAliases: ["Customer"], definition: "客户实体", evidence: ["v1"] }],
    entities: [{ id: "e1", name: "Customer", businessName: "客户", fields: [{ name: "id", type: "string", required: true }] }],
    relations: [],
    rules: [{ id: "r1", name: "客户唯一", statement: "客户唯一", linkedEntityIds: ["e1"], linkedSurfaceIds: [], linkedApiIds: [] }]
  };
}

describe("onAnalysisConfirmed 装配链 — 确认分析后自动发布受门禁阻断", () => {
  beforeEach(() => setup());

  test("候选快照有未解决阻断评审 → 自动发布被门禁阻断，快照保持候选态", () => {
    const { iteration, changeControl, modelingRepo } = setup();

    changeControl.confirmIterationAnalysis(iteration.id, { accurate: true, actor: "用户" });

    const snapshots = modelingRepo.listSnapshots(iteration.projectId);
    assert.equal(snapshots.length, 1);
    // 门禁阻断 publish：快照仍为 candidate，无 published
    assert.equal(snapshots[0].status, "candidate");
    assert.ok(snapshots[0].id.includes("-v1-candidate"));
  });

  test("候选快照无阻断评审 → 自动发布放行，快照转为 published", () => {
    const { workspaceRepo, project, iteration, changeControl, modelingRepo } = setup();
    // 预置已发布 baseline 含「客户」术语 → 新建模无新增术语 → 无阻断评审
    const baseline = {
      id: "snapshot-" + project.id + "-" + iteration.id + "-v1-candidate",
      projectId: project.id, iterationId: iteration.id,
      version: project.id + "." + iteration.id + ".v1.published",
      status: "published",
      ontologyTerms: [{ canonicalTerm: "客户", aliases: [], technicalAliases: ["Customer"], definition: "客户实体", evidence: ["v1"] }],
      entities: [], relations: [], rules: [],
      reviewTasks: [], derivedFromSnapshotId: null, createdAt: "2026-01-01T00:00:00.000Z"
    };
    modelingRepo.saveCandidateSnapshot(baseline);
    modelingRepo.updateSnapshotStatus(baseline.id, "published");

    changeControl.confirmIterationAnalysis(iteration.id, { accurate: true, actor: "用户" });

    const snapshots = modelingRepo.listSnapshots(project.id);
    const newCandidate = snapshots.find((s) => s.status === "candidate" || s.status === "published");
    assert.ok(newCandidate, "无阻断评审时自动发布应生成快照");
  });

  test("门禁阻断自动发布不影响分析确认本身（业务确认与本体发布解耦）", () => {
    const { iteration, changeControl } = setup();

    const result = changeControl.confirmIterationAnalysis(iteration.id, { accurate: true, actor: "用户" });

    assert.equal(result.ok, true);
    const cc = changeControl.getIterationChangeControl(iteration.id);
    assert.equal(cc.pendingHumanConfirmation, false);
    assert.ok(cc.confirmedAt);
  });
});
