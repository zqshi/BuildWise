import type { Iteration, IterationArtifactStage } from "../../domain/workspace/types";
import { defaultIterationChangeControl } from "./workspaceServiceCommon";

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
  if (computedStatus === "ready") return "ready";
  if (computedStatus === "partial") return currentStatus === "ready" ? "ready" : "partial";
  if (item.gateStatus === "passed" || item.outputVersion > 0) return "ready";
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
        current?.editCapability === "rich-text" || current?.editCapability === "prototype-select" || current?.editCapability === "none"
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
      ? `最近分析：${control.lastAnalysisAt}`
      : historySummary || "等待 OpenClaw 完成历史版本洞察采集";
    analysis.status = mergeArtifactStatus(analysis.status, control.lastAnalysisAt ? "ready" : control.lastUploadedAt ? "partial" : "pending", analysis);
    analysis.summary = preferSummary(analysis.summary, defaultSummary);
    analysis.evidence = preferEvidence(analysis.evidence, [
      control.lastAnalysisAt ? `analysisAt=${control.lastAnalysisAt}` : "analysisAt=-",
      control.lastReportQualitySummary || "quality=-"
    ]);
  }
  const boundary = nextItems.find((item) => item.id === "boundary-confirmation");
  if (boundary) {
    const ready = Boolean(
      control.boundary.requirementRefs.length > 0 &&
        control.boundary.componentRefs.length > 0 &&
        control.boundary.codePaths.length > 0
    );
    boundary.status = mergeArtifactStatus(boundary.status, ready ? "ready" : control.boundary.updatedAt ? "partial" : "pending", boundary);
    boundary.summary = preferSummary(
      boundary.summary,
      `requirement=${control.boundary.requirementRefs.length};component=${control.boundary.componentRefs.length};path=${control.boundary.codePaths.length}`
    );
    boundary.evidence = preferEvidence(boundary.evidence, [control.boundary.note || "note=-"]);
  }
  const interaction = nextItems.find((item) => item.id === "prototype-preview");
  if (interaction) {
    interaction.status = mergeArtifactStatus(interaction.status, iteration.interactionState?.hasPrototypeAssets ? "ready" : "pending", interaction);
    interaction.summary = preferSummary(interaction.summary, iteration.interactionState?.hasPrototypeAssets ? "检测到原型资产" : "未检测到原型资产");
    interaction.evidence = preferEvidence(interaction.evidence, [iteration.interactionState?.lastAttachmentName || "attachment=-"]);
  }
  const frontendCode = nextItems.find((item) => item.id === "frontend-code");
  if (frontendCode) {
    const link = iteration.codeLink;
    const ready = Boolean(link?.commit || link?.pr || (link?.paths.length ?? 0) > 0);
    frontendCode.status = mergeArtifactStatus(frontendCode.status, ready ? "ready" : "pending", frontendCode);
    frontendCode.summary = preferSummary(frontendCode.summary, ready ? `branch=${link?.branch || "-"};commit=${link?.commit || "-"}` : "未记录前端代码交付");
    frontendCode.evidence = preferEvidence(frontendCode.evidence, [link?.pr || "pr=-", (link?.paths || []).slice(0, 4).join(" | ") || "paths=-"]);
  }
  const backendCode = nextItems.find((item) => item.id === "backend-code");
  if (backendCode) {
    const link = iteration.codeLink;
    const ready = Boolean(link?.commit || link?.pr || (link?.paths.length ?? 0) > 0);
    backendCode.status = mergeArtifactStatus(backendCode.status, ready ? "ready" : "pending", backendCode);
    backendCode.summary = preferSummary(backendCode.summary, ready ? `branch=${link?.branch || "-"};commit=${link?.commit || "-"}` : "未记录后端代码交付");
    backendCode.evidence = preferEvidence(backendCode.evidence, [link?.pr || "pr=-", (link?.paths || []).slice(0, 4).join(" | ") || "paths=-"]);
  }
  const matrix = nextItems.find((item) => item.id === "test-matrix");
  if (matrix) {
    const summary = summarizeMatrixExecution(control.generatedTestMatrix);
    matrix.status = mergeArtifactStatus(
      matrix.status,
      summary.total === 0 ? "pending" : summary.coverage >= 100 && summary.passRate >= 80 ? "ready" : "partial",
      matrix
    );
    matrix.summary = preferSummary(matrix.summary, `total=${summary.total};coverage=${summary.coverage};passRate=${summary.passRate}`);
    matrix.evidence = preferEvidence(matrix.evidence, [control.testMatrixExecutionUpdatedAt || "executionUpdatedAt=-"]);
  }
  const acceptance = nextItems.find((item) => item.id === "acceptance-checklist");
  if (acceptance) {
    const count = control.qualityArtifacts.acceptanceChecklist.length;
    acceptance.status = mergeArtifactStatus(acceptance.status, count > 0 ? "ready" : "pending", acceptance);
    acceptance.summary = preferSummary(acceptance.summary, `acceptanceChecklist=${count}`);
    acceptance.evidence = preferEvidence(acceptance.evidence, [control.qualityArtifacts.updatedAt || "qualityUpdatedAt=-"]);
  }
  const release = nextItems.find((item) => item.id === "release-review");
  if (release) {
    release.status = mergeArtifactStatus(release.status, control.lastReleaseReviewDecision ? "ready" : "pending", release);
    release.summary = preferSummary(
      release.summary,
      control.lastReleaseReviewDecision
        ? `decision=${control.lastReleaseReviewDecision};score=${control.lastReleaseReviewScore}`
        : "尚未生成发布评审"
    );
    release.evidence = preferEvidence(release.evidence, [control.lastReleaseReviewReason || "reason=-"]);
  }
  const archive = nextItems.find((item) => item.id === "delivery-package");
  if (archive) {
    const files = control.qualityArtifacts.materializedFiles || [];
    archive.status = mergeArtifactStatus(archive.status, files.length > 0 ? "ready" : "pending", archive);
    archive.summary = preferSummary(archive.summary, `materializedFiles=${files.length}`);
    archive.evidence = preferEvidence(archive.evidence, files.slice(0, 6));
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
) {
  const target = items.find((item) => item.id === artifactId);
  if (!target) return;
  const impacted = new Set(target.downstreamImpacts);
  for (const item of items) {
    if (impacted.has(item.stage)) {
      item.stale = true;
      item.gateStatus = "pending";
    }
  }
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
