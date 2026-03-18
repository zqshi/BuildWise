import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  IterationDeliveryPackageResult,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from "../../domain/workspace/types";
import { normalizeIteration, normalizeProject } from "./workspaceSupport";
import { listUncoveredAcceptanceCriteria, normalizeRelPath, writeAuditLog } from "./workspaceServiceCommon";

function summarizeMatrix(matrix: Array<{ executionStatus?: string }>) {
  const total = matrix.length;
  const passed = matrix.filter((item) => item.executionStatus === "passed").length;
  const failed = matrix.filter((item) => item.executionStatus === "failed").length;
  const blocked = matrix.filter((item) => item.executionStatus === "blocked").length;
  const skipped = matrix.filter((item) => item.executionStatus === "skipped").length;
  const executed = passed + failed + blocked + skipped;
  const coverage = total === 0 ? 0 : Math.round((executed / total) * 100);
  const passRate = executed === 0 ? 0 : Math.round((passed / executed) * 100);
  return { total, passed, failed, blocked, skipped, executed, coverage, passRate };
}

function asChecklist(items: string[]) {
  return items.length > 0 ? items.map((item) => `- [ ] ${item}`).join("\n") : "- [ ] 暂无条目";
}

export function generateIterationTestArtifactsOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { dryRun?: boolean }
): IterationTestArtifactsGenerationResponse | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalizedIteration = normalizeIteration(iteration);
  const project = repo.findProject(normalizedIteration.projectId);
  if (!project) {
    return null;
  }
  const normalizedProject = normalizeProject(project);
  const repoPath = normalizedProject.repository?.workspace?.repoPath || "";
  const quality = normalizedIteration.changeControl?.qualityArtifacts;
  const dryRun = input.dryRun !== false;
  const warnings: string[] = [];
  if (!repoPath) {
    warnings.push("仓库未落盘，无法生成物理测试文件。请先执行 repository/scaffold。");
  }
  const basePath = `tests/generated/iteration-${iterationId}`;
  const files = [
    {
      path: `${basePath}/unit.test-plan.md`,
      content: [
        `# Unit Test Plan (Iteration ${iterationId})`,
        "",
        "## Cases",
        asChecklist(quality?.unitTests ?? [])
      ].join("\n")
    },
    {
      path: `${basePath}/contract.test-plan.md`,
      content: [
        `# Contract Test Plan (Iteration ${iterationId})`,
        "",
        "## Cases",
        asChecklist(quality?.contractTests ?? [])
      ].join("\n")
    },
    {
      path: `${basePath}/acceptance-checklist.md`,
      content: [
        `# Acceptance Checklist (Iteration ${iterationId})`,
        "",
        "## Checklist",
        asChecklist(quality?.acceptanceChecklist ?? [])
      ].join("\n")
    },
    {
      path: `${basePath}/regression-points.md`,
      content: [
        `# Regression Watch List (Iteration ${iterationId})`,
        "",
        "## Points",
        asChecklist(quality?.regressionPoints ?? [])
      ].join("\n")
    },
    {
      path: `${basePath}/unit.generated.test.ts`,
      content: [
        `describe("iteration ${iterationId} generated unit checklist", () => {`,
        ...(quality?.unitTests?.length
          ? quality.unitTests.slice(0, 32).map((item, idx) => `  it("unit case ${idx + 1}: ${item.replace(/"/g, '\\"')}", () => {\n    // TODO: implement\n    expect(true).toBe(true);\n  });`)
          : ['  it("placeholder", () => {\n    expect(true).toBe(true);\n  });']),
        "});"
      ].join("\n")
    },
    {
      path: `${basePath}/contract.generated.test.mjs`,
      content: [
        `import assert from "node:assert/strict";`,
        "",
        `describe("iteration ${iterationId} generated contract checklist", () => {`,
        ...(quality?.contractTests?.length
          ? quality.contractTests
              .slice(0, 32)
              .map((item, idx) => `  it("contract case ${idx + 1}: ${item.replace(/"/g, '\\"')}", async () => {\n    // TODO: implement\n    assert.equal(true, true);\n  });`)
          : ['  it("placeholder", async () => {\n    assert.equal(true, true);\n  });']),
        "});"
      ].join("\n")
    }
  ];

  const generatedFiles: string[] = [];
  const skippedFiles: string[] = [];
  for (const item of files) {
    const relPath = normalizeRelPath(item.path);
    if (!repoPath || dryRun) {
      generatedFiles.push(relPath);
      continue;
    }
    const absPath = join(repoPath, relPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, `${item.content}\n`, "utf-8");
    generatedFiles.push(relPath);
  }

  const updated = normalizeIteration(repo.findIteration(iterationId) || normalizedIteration);
  const current = updated.changeControl;
  if (current) {
    updated.changeControl = {
      ...current,
      qualityArtifacts: {
        ...current.qualityArtifacts,
        materializedFiles: generatedFiles,
        updatedAt: new Date().toISOString()
      }
    };
    repo.updateIteration(updated);
  } else {
    skippedFiles.push(...generatedFiles);
  }
  writeAuditLog(repo, "iteration_test_artifacts_generated", `iteration:${iterationId}`, `files=${generatedFiles.length};dryRun=${dryRun ? "yes" : "no"}`);
  return {
    iterationId,
    dryRun,
    summary: dryRun ? "已生成测试产物计划（dry-run）。" : "已写入测试产物文件。",
    generatedFiles,
    skippedFiles,
    warnings
  };
}

export function buildIterationReleaseReviewOp(repo: WorkspaceRepository, iterationId: number): IterationReleaseReviewResponse | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const normalized = normalizeIteration(iteration);
  const changeControl = normalized.changeControl;
  const matrix = Array.isArray(changeControl?.generatedTestMatrix) ? changeControl.generatedTestMatrix : [];
  const summary = summarizeMatrix(matrix);
  const boundary = changeControl?.boundary;
  const boundaryReady = Boolean(
    boundary &&
      boundary.requirementRefs.length > 0 &&
      boundary.componentRefs.length > 0 &&
      boundary.codePaths.length > 0
  );
  const acceptanceChecklistCount = changeControl?.qualityArtifacts?.acceptanceChecklist?.length ?? 0;
  const uncoveredAcceptanceCriteria = listUncoveredAcceptanceCriteria(
    normalized.scope.acceptanceCriteria,
    changeControl?.qualityArtifacts?.acceptanceChecklist ?? [],
    []
  );
  const traceabilityCoverage = Number(changeControl?.lastTraceabilityCoverageScore || 0);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (changeControl?.pendingHumanConfirmation) blockers.push("需求分析尚未人工确认。");
  if (!boundaryReady) blockers.push("边界未收敛（requirement/component/codePaths 需同时具备）。");
  if (acceptanceChecklistCount === 0) blockers.push("缺少验收清单。");
  if (uncoveredAcceptanceCriteria.length > 0) {
    blockers.push(`验收标准未完全覆盖（未覆盖 ${uncoveredAcceptanceCriteria.length} 项）。`);
  }
  if (summary.failed > 0 || summary.blocked > 0) blockers.push(`测试矩阵存在失败/阻断用例（failed=${summary.failed}, blocked=${summary.blocked}）。`);
  if (summary.total > 0 && summary.coverage < 80) blockers.push(`测试矩阵执行覆盖率不足（${summary.coverage}%）。`);
  if (traceabilityCoverage < 40) blockers.push(`需求映射覆盖率过低（${traceabilityCoverage}%）。`);

  if (summary.total > 0 && summary.coverage < 100) warnings.push(`仍有未执行测试用例（coverage=${summary.coverage}%）。`);
  if (summary.executed > 0 && summary.passRate < 90) warnings.push(`测试通过率偏低（passRate=${summary.passRate}%）。`);
  if (traceabilityCoverage >= 40 && traceabilityCoverage < 70) warnings.push(`需求映射覆盖率待提升（${traceabilityCoverage}%）。`);
  if (changeControl?.lastReleaseReviewDecision === "caution") warnings.push("上次发布评审为 caution，建议复核。");
  if (changeControl?.lastOpsRollbackSuggested) warnings.push("近期分析建议过回滚，请重点关注风险路径。");

  if (!boundaryReady) recommendations.push("先补齐 requirementRefs/componentRefs/codePaths 三向边界。");
  if (acceptanceChecklistCount === 0) recommendations.push("根据需求补全 acceptanceChecklist 并关联验收责任人。");
  if (uncoveredAcceptanceCriteria.length > 0) {
    recommendations.push(`补齐未覆盖的验收标准：${uncoveredAcceptanceCriteria.slice(0, 3).join("；")}`);
  }
  if (summary.total > 0 && summary.coverage < 100) recommendations.push("将 pending 用例全部执行完成，再申请发布。");
  if (traceabilityCoverage < 70) recommendations.push("补齐需求-组件-代码映射，确保关键需求有代码落点。");
  if (summary.passRate < 90) recommendations.push("优先修复 failed/blocked 用例，再进行回归验证。");
  if (recommendations.length === 0) recommendations.push("当前质量状态可控，可按门禁发版。");

  const scoreBase = 100;
  const scorePenalty = blockers.length * 18 + warnings.length * 7 + (100 - Math.max(summary.coverage, traceabilityCoverage)) * 0.12;
  const score = Math.max(0, Math.round(scoreBase - scorePenalty));
  const decision: "go" | "caution" | "block" = blockers.length > 0 ? "block" : warnings.length > 0 ? "caution" : "go";
  const rollback = {
    shouldRollback: blockers.length >= 2 || summary.failed > 0 || summary.blocked > 0,
    reason:
      blockers.length > 0
        ? "存在发布阻断项，建议优先止损并评估回滚。"
        : "当前无强阻断项，可继续观察。",
    trigger: "线上核心接口错误率持续上升且 15 分钟内无明显恢复",
    actions: ["冻结增量发布", "回滚至上一个稳定版本", "保留现场指标并触发复盘"]
  };

  return {
    iterationId,
    decision,
    score,
    blockers: Array.from(new Set(blockers)).slice(0, 20),
    warnings: Array.from(new Set(warnings)).slice(0, 20),
    recommendations: Array.from(new Set(recommendations)).slice(0, 12),
    rollback,
    evidence: {
      testMatrixCoverage: summary.total === 0 ? 0 : summary.coverage,
      testMatrixPassRate: summary.executed === 0 ? 0 : summary.passRate,
      traceabilityCoverage,
      boundaryReady,
      acceptanceChecklistCount
    },
    generatedAt: new Date().toISOString()
  };
}

export function generateIterationDeliveryPackageOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null } = {}
): IterationDeliveryPackageResult | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return null;
  }
  const dryRun = input.dryRun !== false;
  const releaseReview = input.releaseReview || buildIterationReleaseReviewOp(repo, iterationId);
  const warnings: string[] = [];
  if (!releaseReview) {
    warnings.push("release review unavailable; package uses fallback metadata.");
  } else if (releaseReview.decision === "block") {
    warnings.push("release review decision is block; package generated for diagnosis only.");
  }

  const basePath = `deliverables/iteration-${iterationId}`;
  return {
    iterationId,
    dryRun,
    summary: dryRun ? "已生成交付包计划（dry-run）。" : "已生成交付包清单。",
    reviewReportFiles: [
      `${basePath}/release-review.md`,
      `${basePath}/risk-summary.md`
    ],
    packageFiles: [
      `${basePath}/delivery-manifest.json`,
      `${basePath}/handover-checklist.md`
    ],
    warnings
  };
}
