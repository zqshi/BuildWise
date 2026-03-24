import type { ModelRelationPayload } from "../../domain/workspace/modelOpsTypes.ts";
import type { ProjectModelViewPayload } from "../../domain/workspace/modelOpsTypes.ts";
import { normalizeProjectModelViewPayload } from "../../app/projectModelViewNormalization.ts";

export type ModelViewOperationalSignals = {
  reviewTaskCount: number;
  blockingReviewTaskCount: number;
  reviewTaskSummary: string;
  evidenceSummary: string;
  alerts: string[];
};

export function toModelRelationsFromView(modelView: ProjectModelViewPayload | null) {
  if (!modelView) {
    return [] as ModelRelationPayload[];
  }
  const normalizedView = normalizeProjectModelViewPayload(modelView);
  return normalizedView.relations.map((relation) => ({
    id: relation.id,
    fromEntityId: relation.fromEntityId,
    toEntityId: relation.toEntityId,
    type: relation.type,
    name: relation.businessMeaning || undefined,
    businessDescription: relation.businessMeaning || undefined,
    ontologyBasis: normalizedView.latestSnapshotId || undefined,
    dataBasis: normalizedView.evidence
  }));
}

export function toModelRuleDescriptionsFromView(modelView: ProjectModelViewPayload | null) {
  if (!modelView) {
    return [];
  }
  const normalizedView = normalizeProjectModelViewPayload(modelView);
  if (normalizedView.rules.length === 0) {
    return [];
  }
  return normalizedView.rules.slice(0, 8).map((rule) => rule.statement || rule.name);
}

export function buildModelSummaryHeadline(modelView: ProjectModelViewPayload | null) {
  if (!modelView) {
    return "";
  }
  const normalizedView = normalizeProjectModelViewPayload(modelView);
  const snapshotLabel =
    normalizedView.latestSnapshotStatus === "published"
      ? "正式快照"
      : normalizedView.latestSnapshotStatus === "candidate"
        ? "候选快照"
        : normalizedView.latestSnapshotStatus === "superseded"
          ? "已废弃快照"
          : "尚无快照";
  return `当前建模以${snapshotLabel}为基线，已沉淀领域规则 ${normalizedView.rules.length} 条、数据实体 ${normalizedView.entities.length} 个、实体关系 ${normalizedView.relations.length} 条。`;
}

export function buildModelSummaryHighlights(modelView: ProjectModelViewPayload | null, fallbackTrend: string) {
  if (!modelView) {
    return fallbackTrend ? [`迭代趋势：${fallbackTrend}`] : [];
  }
  const normalizedView = normalizeProjectModelViewPayload(modelView);
  const items: string[] = [];
  if (normalizedView.latestSnapshotId) {
    items.push(`当前快照：${normalizedView.latestSnapshotId} · ${normalizedView.latestSnapshotStatus}`);
  } else {
    items.push("当前项目尚未发布正式模型快照");
  }
  if (normalizedView.reviewTasks.length > 0) {
    items.push(`待确认：${normalizedView.reviewTasks.slice(0, 2).map((item) => item.title).join("、")}`);
  }
  if (normalizedView.ontologyTerms.length > 0) {
    items.push(`关键术语：${normalizedView.ontologyTerms.slice(0, 3).map((item) => item.businessTerm).join("、")}`);
  }
  if (normalizedView.evidence.length > 0) {
    items.push(`证据：${normalizedView.evidence.slice(0, 2).join("、")}`);
  }
  if (fallbackTrend) {
    items.push(`迭代趋势：${fallbackTrend}`);
  }
  return items.slice(0, 4);
}

export function buildModelOperationalSignals(modelView: ProjectModelViewPayload | null): ModelViewOperationalSignals {
  if (!modelView) {
    return {
      reviewTaskCount: 0,
      blockingReviewTaskCount: 0,
      reviewTaskSummary: "",
      evidenceSummary: "",
      alerts: []
    };
  }
  const normalizedView = normalizeProjectModelViewPayload(modelView);
  const reviewTaskCount = normalizedView.reviewTasks.length;
  const blockingReviewTaskCount = normalizedView.reviewTasks.filter((item) => item.blocking).length;
  const reviewTaskSummary = normalizedView.reviewTasks
    .slice(0, 3)
    .map((item) => `${item.blocking ? "阻断" : "待处理"}:${item.title}`)
    .join("；");
  const evidenceSummary = normalizedView.evidence.slice(0, 4).join("；");
  const alerts: string[] = [];
  if (blockingReviewTaskCount > 0) {
    alerts.push(`当前有 ${blockingReviewTaskCount} 项阻断型建模待确认任务`);
  }
  if (reviewTaskCount > blockingReviewTaskCount) {
    alerts.push(`当前仍有 ${reviewTaskCount} 项待确认建模任务`);
  }
  if (normalizedView.latestSnapshotStatus === "none") {
    alerts.push("尚未形成正式模型快照");
  }
  if (normalizedView.evidence.length === 0) {
    alerts.push("尚未沉淀可复核证据");
  }
  return {
    reviewTaskCount,
    blockingReviewTaskCount,
    reviewTaskSummary,
    evidenceSummary,
    alerts
  };
}
