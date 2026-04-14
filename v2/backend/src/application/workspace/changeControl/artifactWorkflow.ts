import type { Iteration, IterationArtifactStage } from '../../../domain/workspace/types';
import { defaultIterationChangeControl } from '../shared/common';
import { synthesizeArtifactDraftContent } from "./artifactDraftSynthesizer";

export const artifactStageOrder: IterationArtifactStage[] = [
  "clarification",
  "scope",
  "interaction",
  "development",
  "testing",
  "release",
  "archive"
];

function mergeArtifactStatus(
  currentStatus: "pending" | "partial" | "ready",
  computedStatus: "pending" | "partial" | "ready",
  item: {
    outputVersion: number;
    gateStatus: "pending" | "passed" | "blocked";
    summary: string;
    draft?: { content?: string };
  }
) {
  // 权威来源：item 自身的生命周期状态（Orchestrator commit/confirm）
  if (item.gateStatus === "passed" || item.outputVersion > 0) return "ready";
  // 外部信号（changeControl 顶层字段）只能提升到 partial，不能直接到 ready
  if (computedStatus === "ready" || computedStatus === "partial") {
    return currentStatus === "ready" ? "ready" : "partial";
  }
  if (item.summary.trim() || item.draft?.content?.trim()) return "partial";
  return currentStatus;
}

function preferSummary(existing: string, fallback: string) {
  const value = existing.trim();
  return value || fallback;
}

function preferEvidence(existing: string[], fallback: string[]) {
  const cleaned = Array.isArray(existing) ? existing.map((item) => item.trim()).filter(Boolean) : [];
  return cleaned.length > 0 ? cleaned.slice(0, 20) : fallback;
}

export function ensureArtifactWorkflow(iteration: Iteration, control: ReturnType<typeof defaultIterationChangeControl>, now: string) {
  const fallback = defaultIterationChangeControl().artifactWorkflow;
  const existing = Array.isArray(control.artifactWorkflow?.items) ? control.artifactWorkflow.items : [];
  const byId = new Map(existing.map((item) => [item.id, item]));
  const nextItems = fallback.items.map((seed) => {
    const current = byId.get(seed.id);
    const base = current ? { ...seed, ...current } : { ...seed };
    return {
      ...base,
      title: current?.title?.trim() ? current.title : seed.title,
      category: current?.category?.trim() ? current.category : seed.category,
      description: current?.description?.trim() ? current.description : seed.description,
      source: current?.source?.trim() ? current.source : seed.source,
      editCapability:
        current?.editCapability === "rich-text" || current?.editCapability === "prototype-select"
          ? current.editCapability
          : seed.editCapability,
      draft: {
        content: current?.draft?.content || "",
        media: Array.isArray(current?.draft?.media) ? current.draft.media : [],
        updatedAt: current?.draft?.updatedAt || "",
        updatedBy: current?.draft?.updatedBy || ""
      },
      evidence: Array.isArray(base.evidence) ? base.evidence : [],
      downstreamImpacts:
        Array.isArray(base.downstreamImpacts) && base.downstreamImpacts.length > 0 ? base.downstreamImpacts : seed.downstreamImpacts,
      updatedAt: base.updatedAt || now
    };
  });

  const analysis = nextItems.find((item) => item.id === "analysis-report");
  if (analysis) {
    const historySummary =
      iteration.continuity?.inheritedSummary?.trim() ||
      (iteration.assessment?.baselineIterationName ? `基于 ${iteration.assessment.baselineIterationName} 继承上下文` : "");
    const defaultSummary = control.lastAnalysisAt
      ? `分析完成于 ${control.lastAnalysisAt.slice(0, 10)}`
      : historySummary || "等待完成需求分析";
    analysis.status = mergeArtifactStatus(analysis.status, control.lastAnalysisAt ? "ready" : control.lastUploadedAt ? "partial" : "pending", analysis);
    analysis.summary = preferSummary(analysis.summary, defaultSummary);
    analysis.evidence = preferEvidence(analysis.evidence, [
      control.lastAnalysisAt ? `分析时间：${control.lastAnalysisAt.slice(0, 10)}` : "分析时间：待完成",
      control.lastReportQualitySummary || "质量评估：待评"
    ]);
  }
  const boundary = nextItems.find((item) => item.id === "boundary-confirmation");
  if (boundary) {
    const filledDimensions = [
      control.boundary.requirementRefs.length > 0,
      control.boundary.componentRefs.length > 0,
      control.boundary.codePaths.length > 0
    ].filter(Boolean).length;
    const boundaryStatus = filledDimensions >= 2 ? "ready" : filledDimensions === 1 ? "partial" : "pending";
    boundary.status = mergeArtifactStatus(boundary.status, boundaryStatus, boundary);
    boundary.summary = preferSummary(
      boundary.summary,
      `需求 ${control.boundary.requirementRefs.length} 项、组件 ${control.boundary.componentRefs.length} 个、代码路径 ${control.boundary.codePaths.length} 条`
    );
    boundary.evidence = preferEvidence(boundary.evidence, [control.boundary.note || "备注：无"]);
  }
  const interaction = nextItems.find((item) => item.id === "prototype-preview");
  if (interaction) {
    interaction.status = mergeArtifactStatus(interaction.status, iteration.interactionState?.hasPrototypeAssets ? "ready" : "pending", interaction);
    interaction.summary = preferSummary(interaction.summary, iteration.interactionState?.hasPrototypeAssets ? "检测到原型资产" : "未检测到原型资产");
    interaction.evidence = preferEvidence(interaction.evidence, [iteration.interactionState?.lastAttachmentName || "附件：无"]);
  }
  const frontendCode = nextItems.find((item) => item.id === "frontend-code");
  if (frontendCode) {
    const link = iteration.codeLink;
    const ready = Boolean(link?.commit || link?.pr || (link?.paths.length ?? 0) > 0);
    frontendCode.status = mergeArtifactStatus(frontendCode.status, ready ? "ready" : "pending", frontendCode);
    frontendCode.summary = preferSummary(frontendCode.summary, ready ? `分支：${link?.branch || "未知"}，提交：${link?.commit || "未知"}` : "尚未记录前端代码交付");
    const frontendPaths = link?.paths ?? [];
    frontendCode.evidence = preferEvidence(frontendCode.evidence, [link?.pr ? `PR：${link.pr}` : "PR：待关联", frontendPaths.length > 0 ? `变更路径 ${frontendPaths.length} 条` : "变更路径：待记录"]);
  }
  const backendCode = nextItems.find((item) => item.id === "backend-code");
  if (backendCode) {
    const link = iteration.codeLink;
    const ready = Boolean(link?.commit || link?.pr || (link?.paths.length ?? 0) > 0);
    backendCode.status = mergeArtifactStatus(backendCode.status, ready ? "ready" : "pending", backendCode);
    backendCode.summary = preferSummary(backendCode.summary, ready ? `分支：${link?.branch || "未知"}，提交：${link?.commit || "未知"}` : "尚未记录后端代码交付");
    const backendPaths = link?.paths ?? [];
    backendCode.evidence = preferEvidence(backendCode.evidence, [link?.pr ? `PR：${link.pr}` : "PR：待关联", backendPaths.length > 0 ? `变更路径 ${backendPaths.length} 条` : "变更路径：待记录"]);
  }
  const matrix = nextItems.find((item) => item.id === "test-matrix");
  if (matrix) {
    const summary = summarizeMatrixExecution(control.generatedTestMatrix);
    matrix.status = mergeArtifactStatus(
      matrix.status,
      summary.total === 0 ? "pending" : summary.coverage >= 100 && summary.passRate >= 80 ? "ready" : "partial",
      matrix
    );
    matrix.summary = preferSummary(matrix.summary, `测试用例 ${summary.total} 个、覆盖率 ${summary.coverage}%、通过率 ${summary.passRate}%`);
    matrix.evidence = preferEvidence(matrix.evidence, [control.testMatrixExecutionUpdatedAt ? `执行更新：${control.testMatrixExecutionUpdatedAt.slice(0, 10)}` : "执行更新：待完成"]);
  }
  const acceptance = nextItems.find((item) => item.id === "acceptance-checklist");
  if (acceptance) {
    const count = control.qualityArtifacts.acceptanceChecklist.length;
    acceptance.status = mergeArtifactStatus(acceptance.status, count > 0 ? "ready" : "pending", acceptance);
    acceptance.summary = preferSummary(acceptance.summary, `验收清单 ${count} 项`);
    acceptance.evidence = preferEvidence(acceptance.evidence, [control.qualityArtifacts.updatedAt ? `质量更新：${control.qualityArtifacts.updatedAt.slice(0, 10)}` : "质量更新：待完成"]);
  }
  const release = nextItems.find((item) => item.id === "release-review");
  if (release) {
    const decisionLabel = control.lastReleaseReviewDecision === "go" ? "允许发布" : control.lastReleaseReviewDecision === "caution" ? "谨慎发布" : control.lastReleaseReviewDecision === "block" ? "阻塞发布" : "";
    release.status = mergeArtifactStatus(release.status, control.lastReleaseReviewDecision ? "ready" : "pending", release);
    release.summary = preferSummary(
      release.summary,
      decisionLabel
        ? `评审结论：${decisionLabel}（${control.lastReleaseReviewScore} 分）`
        : "尚未生成发布评审"
    );
    release.evidence = preferEvidence(release.evidence, [control.lastReleaseReviewReason || "评审理由：待生成"]);
  }
  const archive = nextItems.find((item) => item.id === "delivery-package");
  if (archive) {
    const files = control.qualityArtifacts.materializedFiles || [];
    archive.status = mergeArtifactStatus(archive.status, files.length > 0 ? "ready" : "pending", archive);
    archive.summary = preferSummary(archive.summary, `归档文件 ${files.length} 个`);
    archive.evidence = preferEvidence(archive.evidence, files.slice(0, 6));
  }
  // ── 以下交付物从 changeControl 字段驱动外部信号 ──

  const prd = nextItems.find((item) => item.id === "product-requirements-doc");
  if (prd) {
    const hasBizData = Boolean(control.lastBusinessConfirmation?.coreIntent?.trim());
    prd.status = mergeArtifactStatus(
      prd.status,
      hasBizData ? "ready" : control.lastAnalysisAt ? "partial" : "pending",
      prd
    );
    prd.summary = preferSummary(prd.summary,
      hasBizData
        ? `核心意图已识别，功能要点 ${control.lastBusinessConfirmation?.functionalPoints?.length || 0} 项`
        : "等待需求分析");
  }

  const designSpec = nextItems.find((item) => item.id === "design-spec");
  if (designSpec) {
    const ux = control.uxArtifacts;
    const hasUxData = (ux?.interactionFlows?.length ?? 0) > 0
      || (ux?.informationArchitecture?.length ?? 0) > 0
      || (ux?.uiStates?.length ?? 0) > 0;
    designSpec.status = mergeArtifactStatus(
      designSpec.status,
      hasUxData ? "ready" : "pending",
      designSpec
    );
    designSpec.summary = preferSummary(designSpec.summary,
      hasUxData ? `交互流程 ${ux!.interactionFlows.length} 条、界面状态 ${ux!.uiStates.length} 个` : "等待交互设计输入");
  }

  const techArch = nextItems.find((item) => item.id === "technical-architecture");
  if (techArch) {
    const hasComponents = (control.boundary?.componentRefs?.length ?? 0) > 0;
    const hasCodePaths = (control.boundary?.codePaths?.length ?? 0) > 0;
    techArch.status = mergeArtifactStatus(
      techArch.status,
      hasComponents || hasCodePaths ? "ready" : "pending",
      techArch
    );
    techArch.summary = preferSummary(techArch.summary,
      hasComponents || hasCodePaths
        ? `组件 ${control.boundary.componentRefs.length} 个、代码路径 ${control.boundary.codePaths.length} 条`
        : "等待边界确认");
  }

  const apiSpec = nextItems.find((item) => item.id === "api-specification");
  if (apiSpec) {
    const apiEntries = (control.domainKnowledgeEntries || []).filter(
      (e: { mappedApis?: unknown[] }) => Array.isArray(e.mappedApis) && e.mappedApis.length > 0
    );
    apiSpec.status = mergeArtifactStatus(
      apiSpec.status,
      apiEntries.length > 0 ? "ready" : "pending",
      apiSpec
    );
    apiSpec.summary = preferSummary(apiSpec.summary,
      apiEntries.length > 0 ? `接口映射 ${apiEntries.length} 条` : "等待领域知识提取");
  }

  const dbDesign = nextItems.find((item) => item.id === "database-design");
  if (dbDesign) {
    const entityEntries = (control.domainKnowledgeEntries || []).filter(
      (e: { mappedEntities?: unknown[] }) => Array.isArray(e.mappedEntities) && e.mappedEntities.length > 0
    );
    dbDesign.status = mergeArtifactStatus(
      dbDesign.status,
      entityEntries.length > 0 ? "ready" : "pending",
      dbDesign
    );
    dbDesign.summary = preferSummary(dbDesign.summary,
      entityEntries.length > 0 ? `实体映射 ${entityEntries.length} 条` : "等待领域知识提取");
  }

  const deployPlan = nextItems.find((item) => item.id === "deployment-plan");
  if (deployPlan) {
    const hasDecision = Boolean(control.lastReleaseReviewDecision);
    const hasScope = (control.boundary?.componentRefs?.length ?? 0) > 0
      || (control.boundary?.codePaths?.length ?? 0) > 0;
    const hasChecks = (control.qualityArtifacts?.acceptanceChecklist?.length ?? 0) > 0
      || (control.executableConstraints?.acceptanceChecks?.length ?? 0) > 0;
    const deploySignal = hasDecision && hasScope ? "ready"
      : hasDecision || hasScope || hasChecks ? "partial" : "pending";
    deployPlan.status = mergeArtifactStatus(deployPlan.status, deploySignal, deployPlan);
    deployPlan.summary = preferSummary(deployPlan.summary,
      hasDecision
        ? `发布评审已完成，部署范围 ${(control.boundary?.componentRefs?.length ?? 0) + (control.boundary?.codePaths?.length ?? 0)} 项`
        : "等待发布评审");
  }

  // 自动合成 draft.content — 如果 draft 不足 100 字且有 metadata 可用，生成可读内容
  for (const item of nextItems) {
    if (item.draft.content.trim().length < 100) {
      const synthesized = synthesizeArtifactDraftContent(item.id, iteration, control);
      if (synthesized) {
        item.draft.content = synthesized;
        item.draft.updatedAt = item.draft.updatedAt || now;
        item.draft.updatedBy = item.draft.updatedBy || "system";
      }
    }
  }

  const activeStage = (control.artifactWorkflow?.activeStage as IterationArtifactStage) || fallback.activeStage;
  return {
    activeStage,
    items: nextItems,
    updatedAt: now
  };
}

export function markDownstreamStale(
  items: ReturnType<typeof defaultIterationChangeControl>["artifactWorkflow"]["items"],
  artifactId: string
): Array<{ id: string; title: string }> {
  const target = items.find((item) => item.id === artifactId);
  if (!target) return [];
  const impacted = new Set(target.downstreamImpacts);
  const staleItems: Array<{ id: string; title: string }> = [];
  for (const item of items) {
    if (impacted.has(item.stage)) {
      item.stale = true;
      item.gateStatus = "pending";
      staleItems.push({ id: item.id, title: item.title });
    }
  }
  return staleItems;
}

export type TestMatrixExecutionUpdate = {
  caseId: string;
  status: "pending" | "passed" | "failed" | "blocked" | "skipped";
  by?: string;
  note?: string;
};

export function summarizeMatrixExecution(
  matrix: Array<{ executionStatus?: string }>
): {
  total: number;
  executed: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  coverage: number;
  passRate: number;
} {
  const total = matrix.length;
  const passed = matrix.filter((item) => item.executionStatus === "passed").length;
  const failed = matrix.filter((item) => item.executionStatus === "failed").length;
  const blocked = matrix.filter((item) => item.executionStatus === "blocked").length;
  const skipped = matrix.filter((item) => item.executionStatus === "skipped").length;
  const executed = passed + failed + blocked + skipped;
  const coverage = total === 0 ? 100 : Math.round((executed / total) * 100);
  const passRate = executed === 0 ? (total === 0 ? 100 : 0) : Math.round((passed / executed) * 100);
  return { total, executed, passed, failed, blocked, skipped, coverage, passRate };
}
