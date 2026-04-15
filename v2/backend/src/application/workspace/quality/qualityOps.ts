import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  IterationDeliveryPackageResult,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import { normalizeIteration, normalizeProject } from '../shared/workspaceSupport';
import { listUncoveredAcceptanceCriteria, defaultIterationChangeControl, normalizeRelPath, writeAuditLog } from '../shared/common';

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

function buildTestArtifactFiles(
  iterationId: number,
  quality: ReturnType<typeof normalizeIteration>["changeControl"] extends infer C ? C extends { qualityArtifacts?: infer Q } ? Q : undefined : undefined
) {
  const basePath = `tests/generated/iteration-${iterationId}`;
  return [
    {
      path: `${basePath}/unit.test-plan.md`,
      content: [`# Unit Test Plan (Iteration ${iterationId})`, "", "## Cases", asChecklist(quality?.unitTests ?? [])].join("\n")
    },
    {
      path: `${basePath}/contract.test-plan.md`,
      content: [`# Contract Test Plan (Iteration ${iterationId})`, "", "## Cases", asChecklist(quality?.contractTests ?? [])].join("\n")
    },
    {
      path: `${basePath}/acceptance-checklist.md`,
      content: [`# Acceptance Checklist (Iteration ${iterationId})`, "", "## Checklist", asChecklist(quality?.acceptanceChecklist ?? [])].join("\n")
    },
    {
      path: `${basePath}/regression-points.md`,
      content: [`# Regression Watch List (Iteration ${iterationId})`, "", "## Points", asChecklist(quality?.regressionPoints ?? [])].join("\n")
    },
    {
      path: `${basePath}/unit.generated.test.ts`,
      content: [
        `describe("iteration ${iterationId} generated unit checklist", () => {`,
        ...(quality?.unitTests?.length
          ? quality.unitTests.slice(0, 32).map((item, idx) => `  it.skip("unit case ${idx + 1}: ${item.replace(/"/g, '\\"')} [stub - needs implementation]", () => {\n    // TODO: implement real assertion\n    expect(true).toBe(true);\n  });`)
          : ['  it.skip("placeholder [stub - needs implementation]", () => {\n    expect(true).toBe(true);\n  });']),
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
              .map((item, idx) => `  it.skip("contract case ${idx + 1}: ${item.replace(/"/g, '\\"')} [stub - needs implementation]", async () => {\n    // TODO: implement real assertion\n    assert.equal(true, true);\n  });`)
          : ['  it.skip("placeholder [stub - needs implementation]", async () => {\n    assert.equal(true, true);\n  });']),
        "});"
      ].join("\n")
    }
  ];
}

export function generateIterationTestArtifactsOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { dryRun?: boolean }
): IterationTestArtifactsGenerationResponse | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const ni = normalizeIteration(iteration);
  const project = repo.findProject(ni.projectId);
  if (!project) return null;
  const repoPath = normalizeProject(project).repository?.workspace?.repoPath || "";
  const dryRun = input.dryRun !== false;
  const warnings: string[] = [];
  if (!repoPath) warnings.push("仓库未落盘，无法生成物理测试文件。请先执行 repository/scaffold。");
  const files = buildTestArtifactFiles(iterationId, ni.changeControl?.qualityArtifacts);
  const generatedFiles: string[] = [];
  const skippedFiles: string[] = [];
  for (const item of files) {
    const relPath = normalizeRelPath(item.path);
    if (!repoPath || dryRun) { generatedFiles.push(relPath); continue; }
    const absPath = join(repoPath, relPath);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, `${item.content}\n`, "utf-8");
    generatedFiles.push(relPath);
  }
  const updated = normalizeIteration(repo.findIteration(iterationId) || ni);
  const current = updated.changeControl;
  if (current) {
    updated.changeControl = {
      ...current,
      qualityArtifacts: { ...current.qualityArtifacts, materializedFiles: generatedFiles, updatedAt: new Date().toISOString() }
    };
    repo.updateIteration(updated);
  } else {
    skippedFiles.push(...generatedFiles);
  }
  writeAuditLog(repo, "testing.artifacts-generated", `iteration:${iterationId}`, `files=${generatedFiles.length};dryRun=${dryRun ? "yes" : "no"}`);
  return {
    iterationId, dryRun,
    summary: dryRun ? "已生成测试产物计划（预演模式）。" : "已写入测试产物文件。",
    generatedFiles, skippedFiles, warnings
  };
}

function assessReleaseReadiness(ctx: {
  summary: ReturnType<typeof summarizeMatrix>;
  boundaryReady: boolean;
  acceptanceChecklistCount: number;
  uncoveredAcceptanceCriteria: string[];
  traceabilityCoverage: number;
  pendingHumanConfirmation?: boolean;
  lastReleaseReviewDecision?: string;
  lastOpsRollbackSuggested?: boolean;
}) {
  const { summary: s, boundaryReady, acceptanceChecklistCount, uncoveredAcceptanceCriteria, traceabilityCoverage: tc } = ctx;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  if (ctx.pendingHumanConfirmation) blockers.push("需求分析尚未人工确认。");
  if (!boundaryReady) blockers.push("边界未收敛（需求映射、组件、代码路径需同时具备）。");
  if (acceptanceChecklistCount === 0) blockers.push("缺少验收清单。");
  if (uncoveredAcceptanceCriteria.length > 0) blockers.push(`验收标准未完全覆盖（未覆盖 ${uncoveredAcceptanceCriteria.length} 项）。`);
  if (s.failed > 0 || s.blocked > 0) blockers.push(`测试矩阵存在失败/阻断用例（失败 ${s.failed} 个、阻断 ${s.blocked} 个）。`);
  if (s.total > 0 && s.coverage < 80) blockers.push(`测试矩阵执行覆盖率不足（${s.coverage}%）。`);
  if (tc < 40) blockers.push(`需求映射覆盖率过低（${tc}%）。`);
  if (s.total > 0 && s.coverage < 100) warnings.push(`仍有未执行测试用例（覆盖率 ${s.coverage}%）。`);
  if (s.executed > 0 && s.passRate < 90) warnings.push(`测试通过率偏低（通过率 ${s.passRate}%）。`);
  if (tc >= 40 && tc < 70) warnings.push(`需求映射覆盖率待提升（${tc}%）。`);
  if (ctx.lastReleaseReviewDecision === "caution") warnings.push("上次发布评审为「谨慎发布」，建议复核。");
  if (ctx.lastOpsRollbackSuggested) warnings.push("近期分析建议过回滚，请重点关注风险路径。");
  if (!boundaryReady) recommendations.push("先补齐需求映射、组件、代码路径三向边界。");
  if (acceptanceChecklistCount === 0) recommendations.push("根据需求补全验收清单并关联验收责任人。");
  if (uncoveredAcceptanceCriteria.length > 0) recommendations.push(`补齐未覆盖的验收标准：${uncoveredAcceptanceCriteria.slice(0, 3).join("；")}`);
  if (s.total > 0 && s.coverage < 100) recommendations.push("将待执行用例全部完成，再申请发布。");
  if (tc < 70) recommendations.push("补齐需求-组件-代码映射，确保关键需求有代码落点。");
  if (s.passRate < 90) recommendations.push("优先修复失败和阻断用例，再进行回归验证。");
  if (recommendations.length === 0) recommendations.push("当前质量状态可控，可按门禁发版。");
  const penalty = blockers.length * 18 + warnings.length * 7 + (100 - Math.max(s.coverage, tc)) * 0.12;
  const score = Math.max(0, Math.round(100 - penalty));
  const decision: "go" | "caution" | "block" = blockers.length > 0 ? "block" : warnings.length > 0 ? "caution" : "go";
  const rollback = {
    shouldRollback: blockers.length >= 2 || s.failed > 0 || s.blocked > 0,
    reason: blockers.length > 0 ? "存在发布阻断项，建议优先止损并评估回滚。" : "当前无强阻断项，可继续观察。",
    trigger: "线上核心接口错误率持续上升且 15 分钟内无明显恢复",
    actions: ["冻结增量发布", "回滚至上一个稳定版本", "保留现场指标并触发复盘"]
  };
  return { blockers, warnings, recommendations, score, decision, rollback };
}

export function buildIterationReleaseReviewOp(repo: WorkspaceRepository, iterationId: number): IterationReleaseReviewResponse | null {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) return null;
  const normalized = normalizeIteration(iteration);
  const cc = normalized.changeControl;
  const matrix = Array.isArray(cc?.generatedTestMatrix) ? cc.generatedTestMatrix : [];
  const summary = summarizeMatrix(matrix);
  const boundary = cc?.boundary;
  const boundaryReady = Boolean(boundary && boundary.requirementRefs.length > 0 && boundary.componentRefs.length > 0 && boundary.codePaths.length > 0);
  const acceptanceChecklistCount = cc?.qualityArtifacts?.acceptanceChecklist?.length ?? 0;
  const uncoveredAcceptanceCriteria = listUncoveredAcceptanceCriteria(normalized.scope.acceptanceCriteria, cc?.qualityArtifacts?.acceptanceChecklist ?? [], []);
  const traceabilityCoverage = Number(cc?.lastTraceabilityCoverageScore || 0);
  const assessment = assessReleaseReadiness({
    summary, boundaryReady, acceptanceChecklistCount, uncoveredAcceptanceCriteria, traceabilityCoverage,
    pendingHumanConfirmation: cc?.pendingHumanConfirmation,
    lastReleaseReviewDecision: cc?.lastReleaseReviewDecision,
    lastOpsRollbackSuggested: cc?.lastOpsRollbackSuggested
  });
  const generatedAt = new Date().toISOString();
  const latest = repo.findIteration(iterationId);
  if (latest) {
    const latestNormalized = normalizeIteration(latest);
    const latestCc = latestNormalized.changeControl ?? defaultIterationChangeControl();
    latestNormalized.changeControl = {
      ...latestCc,
      lastReleaseReviewDecision: assessment.decision,
      lastReleaseReviewReason: assessment.blockers[0] || assessment.warnings[0] || "",
      lastReleaseReviewBlockers: Array.from(new Set(assessment.blockers)).slice(0, 20),
      lastReleaseReviewScore: assessment.score,
      lastReleaseReviewUpdatedAt: generatedAt,
      lastOpsRollbackSuggested: assessment.rollback.shouldRollback
    };
    repo.updateIteration(latestNormalized);
  }
  return {
    iterationId, decision: assessment.decision, score: assessment.score,
    blockers: Array.from(new Set(assessment.blockers)).slice(0, 20),
    warnings: Array.from(new Set(assessment.warnings)).slice(0, 20),
    recommendations: Array.from(new Set(assessment.recommendations)).slice(0, 12),
    rollback: assessment.rollback,
    evidence: {
      testMatrixCoverage: summary.total === 0 ? 0 : summary.coverage,
      testMatrixPassRate: summary.executed === 0 ? 0 : summary.passRate,
      traceabilityCoverage, boundaryReady, acceptanceChecklistCount
    },
    generatedAt
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
    warnings.push("发布评审数据不可用，交付包使用降级元数据生成。");
  } else if (releaseReview.decision === "block") {
    warnings.push("发布评审结论为阻塞，交付包仅用于诊断参考。");
  }

  const basePath = `deliverables/iteration-${iterationId}`;
  const allFiles = [
    `${basePath}/release-review.md`,
    `${basePath}/risk-summary.md`,
    `${basePath}/delivery-manifest.json`,
    `${basePath}/handover-checklist.md`
  ];

  // 回写 materializedFiles：追加交付包文件（不覆盖已有的测试产物文件）
  const updated = normalizeIteration(repo.findIteration(iterationId) || iteration);
  const current = updated.changeControl;
  if (current) {
    const existing = current.qualityArtifacts?.materializedFiles ?? [];
    const merged = Array.from(new Set([...existing, ...allFiles]));
    updated.changeControl = {
      ...current,
      qualityArtifacts: {
        ...current.qualityArtifacts,
        materializedFiles: merged,
        updatedAt: new Date().toISOString()
      }
    };
    repo.updateIteration(updated);
  }

  writeAuditLog(repo, "delivery.package-generated", `iteration:${iterationId}`, `files=${allFiles.length};dryRun=${dryRun ? "yes" : "no"}`);
  return {
    iterationId,
    dryRun,
    summary: dryRun ? "已生成交付包计划（预演模式）。" : "已生成交付包清单。",
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
