import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceService } from "../src/application/workspace/workspaceService.ts";
import { buildIterationReleaseReviewOp } from "../src/application/workspace/workspaceServiceQualityOps.ts";
import { publishIterationToRemoteOp } from "../src/application/workspace/workspaceServiceProjectPublishOps.ts";
import { defaultIterationChangeControl } from "../src/application/workspace/workspaceServiceCommon.ts";
import { deriveProductionDeliveryLoop } from "../src/application/workspace/workspaceProductionDeliveryLoop.ts";
import { JsonWorkspaceRepository } from "../src/infrastructure/persistence/jsonWorkspaceRepository.ts";

function createWorkspaceService() {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-production-loop-"));
  const dataFile = path.join(fixtureDir, "workspace.json");
  writeFileSync(
    dataFile,
    JSON.stringify(
      {
        projects: [],
        iterations: [],
        messages: [],
        snapshots: [],
        transitions: [],
        auditLogs: [],
        versionSnapshots: [],
        projectShares: [],
        deployments: [],
        templateRuns: [],
        opsTriageTemplates: [],
        projectPolicies: [],
        projectWorkspaceBindings: [],
        policyExecutionLogs: [],
        projectRoleBindings: [],
        platformRoleBindings: [],
        governanceCustomRoles: []
      },
      null,
      2
    ),
    "utf-8"
  );
  const repository = new JsonWorkspaceRepository(dataFile);
  return { service: new WorkspaceService(repository, null), repository, fixtureDir };
}

function markArtifact(control, id, patch) {
  control.artifactWorkflow.items = control.artifactWorkflow.items.map((item) =>
    item.id === id ? { ...item, ...patch, updatedAt: patch.updatedAt || item.updatedAt || new Date().toISOString() } : item
  );
}

function buildReleaseReadyControl() {
  const control = defaultIterationChangeControl({ isFirstIteration: true });
  const now = new Date().toISOString();
  markArtifact(control, "prototype-preview", {
    status: "ready",
    gateStatus: "passed",
    summary: "原型主流程与异常状态已确认。",
    updatedAt: now
  });
  markArtifact(control, "technical-architecture", {
    status: "ready",
    gateStatus: "passed",
    summary: "技术架构已对齐模块职责、数据流与回滚点。",
    updatedAt: now
  });
  markArtifact(control, "code-delivery", {
    status: "ready",
    gateStatus: "passed",
    summary: "代码实现已完成并映射到边界路径。",
    updatedAt: now
  });
  markArtifact(control, "test-matrix", {
    status: "ready",
    gateStatus: "passed",
    summary: "测试矩阵已全量执行。",
    updatedAt: now
  });
  markArtifact(control, "acceptance-checklist", {
    status: "ready",
    gateStatus: "passed",
    summary: "验收清单已覆盖业务验收标准。",
    updatedAt: now
  });
  control.generatedTestMatrix = [
    {
      type: "unit",
      caseId: "UNIT-1",
      focus: "标题生成",
      expected: "返回可用标题",
      evidence: "vitest",
      executionStatus: "passed",
      executionUpdatedAt: now,
      executionBy: "qa",
      executionNote: ""
    },
    {
      type: "contract",
      caseId: "CONTRACT-1",
      focus: "生成接口",
      expected: "接口返回结构稳定",
      evidence: "contract",
      executionStatus: "passed",
      executionUpdatedAt: now,
      executionBy: "qa",
      executionNote: ""
    }
  ];
  control.generatedTestMatrixUpdatedAt = now;
  control.testMatrixExecutionUpdatedAt = now;
  control.qualityArtifacts.acceptanceChecklist = ["生成 3 组创意标题与卖点文案", "支持选择后继续编辑"];
  control.qualityArtifacts.updatedAt = now;
  control.lastTraceabilityCoverageScore = 92;
  control.boundary = {
    requirementRefs: ["REQ-1", "REQ-2"],
    componentRefs: ["CreativeGeneratorPage", "IdeaResultCard"],
    codePaths: ["apps/web/src/features/creative-generator", "apps/api/src/creative-generator"],
    note: "boundary ready",
    updatedAt: now
  };
  control.productionDeliveryLoop = deriveProductionDeliveryLoop(
    {
      artifactWorkflow: control.artifactWorkflow,
      generatedTestMatrix: control.generatedTestMatrix,
      qualityArtifacts: control.qualityArtifacts,
      testMatrixExecutionUpdatedAt: control.testMatrixExecutionUpdatedAt,
      generatedTestMatrixUpdatedAt: control.generatedTestMatrixUpdatedAt,
      lastTraceabilityCoverageScore: control.lastTraceabilityCoverageScore
    },
    now
  );
  return control;
}

test("deriveProductionDeliveryLoop requires prototype alignment when prototype artifact is not ready", () => {
  const control = defaultIterationChangeControl({ isFirstIteration: true });
  const loop = deriveProductionDeliveryLoop({
    artifactWorkflow: control.artifactWorkflow,
    generatedTestMatrix: control.generatedTestMatrix,
    qualityArtifacts: control.qualityArtifacts,
    testMatrixExecutionUpdatedAt: control.testMatrixExecutionUpdatedAt,
    generatedTestMatrixUpdatedAt: control.generatedTestMatrixUpdatedAt,
    lastTraceabilityCoverageScore: control.lastTraceabilityCoverageScore
  });

  assert.equal(loop.state, "need_prototype_alignment");
  assert.match(loop.blockedBy.join(" "), /原型交互未确认/);
});

test("deriveProductionDeliveryLoop enters repairing when failed tests remain", () => {
  const control = buildReleaseReadyControl();
  control.generatedTestMatrix[1].executionStatus = "failed";
  control.productionDeliveryLoop = deriveProductionDeliveryLoop(
    {
      artifactWorkflow: control.artifactWorkflow,
      generatedTestMatrix: control.generatedTestMatrix,
      qualityArtifacts: control.qualityArtifacts,
      testMatrixExecutionUpdatedAt: control.testMatrixExecutionUpdatedAt,
      generatedTestMatrixUpdatedAt: control.generatedTestMatrixUpdatedAt,
      lastTraceabilityCoverageScore: control.lastTraceabilityCoverageScore
    },
    new Date().toISOString()
  );

  assert.equal(control.productionDeliveryLoop.state, "repairing");
  assert.match(control.productionDeliveryLoop.blockedBy.join(" "), /failed/);
});

test("buildIterationReleaseReviewOp blocks release when production delivery loop is not release-ready", () => {
  const { service, repository } = createWorkspaceService();
  const project = service.createProject({ name: "Creative Generator", description: "production loop review" });
  const iteration = service.createIteration(project.id, {
    name: "V1",
    description: "creative generator mvp",
    goals: ["生成创意标题", "输出卖点文案"]
  });
  const current = repository.findIteration(iteration.id);
  assert.ok(current);
  current.changeControl = buildReleaseReadyControl();
  markArtifact(current.changeControl, "technical-architecture", {
    status: "pending",
    gateStatus: "pending",
    summary: ""
  });
  current.changeControl.productionDeliveryLoop = deriveProductionDeliveryLoop(
    {
      artifactWorkflow: current.changeControl.artifactWorkflow,
      generatedTestMatrix: current.changeControl.generatedTestMatrix,
      qualityArtifacts: current.changeControl.qualityArtifacts,
      testMatrixExecutionUpdatedAt: current.changeControl.testMatrixExecutionUpdatedAt,
      generatedTestMatrixUpdatedAt: current.changeControl.generatedTestMatrixUpdatedAt,
      lastTraceabilityCoverageScore: current.changeControl.lastTraceabilityCoverageScore
    },
    new Date().toISOString()
  );
  repository.updateIteration(current);

  const review = buildIterationReleaseReviewOp(repository, iteration.id);
  assert.ok(review);
  assert.equal(review.decision, "block");
  assert.equal(review.evidence.productionDeliveryLoopState, "need_arch_alignment");
  assert.match(review.blockers.join(" "), /生产交付闭环未完成/);
});

test("publishIterationToRemoteOp blocks before publish when production delivery loop is incomplete", async () => {
  const { service, repository, fixtureDir } = createWorkspaceService();
  const project = service.createProject({ name: "Creative Generator Publish", description: "publish gate" });
  const repoProject = repository.findProject(project.id);
  assert.ok(repoProject?.repository);
  repoProject.repository = {
    ...repoProject.repository,
    workspace: {
      rootPath: fixtureDir,
      repoPath: fixtureDir,
      gitInitialized: true,
      lastScaffoldedAt: new Date().toISOString()
    }
  };
  repository.updateProject(repoProject);
  const iteration = service.createIteration(project.id, {
    name: "V1",
    description: "creative generator mvp",
    goals: ["生成创意标题", "输出卖点文案"]
  });
  const current = repository.findIteration(iteration.id);
  assert.ok(current);
  current.changeControl = buildReleaseReadyControl();
  markArtifact(current.changeControl, "test-matrix", {
    status: "partial",
    gateStatus: "pending",
    summary: "仍有待执行测试。"
  });
  current.changeControl.generatedTestMatrix[1].executionStatus = "pending";
  current.changeControl.productionDeliveryLoop = deriveProductionDeliveryLoop(
    {
      artifactWorkflow: current.changeControl.artifactWorkflow,
      generatedTestMatrix: current.changeControl.generatedTestMatrix,
      qualityArtifacts: current.changeControl.qualityArtifacts,
      testMatrixExecutionUpdatedAt: current.changeControl.testMatrixExecutionUpdatedAt,
      generatedTestMatrixUpdatedAt: current.changeControl.generatedTestMatrixUpdatedAt,
      lastTraceabilityCoverageScore: current.changeControl.lastTraceabilityCoverageScore
    },
    new Date().toISOString()
  );
  repository.updateIteration(current);

  const publish = await publishIterationToRemoteOp(repository, iteration.id, { dryRun: true });
  assert.equal(publish.ok, false);
  if (publish.ok) {
    return;
  }
  assert.equal(publish.reason, "production_delivery_loop_incomplete");
  assert.equal(publish.message, "production delivery loop is testing");
});
