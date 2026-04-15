import { parseJsonObjectFromText, pickString, pickStringList } from './extractors';

const normalizeImpactLevel = (value: string): "高" | "中" | "低" => (value === "高" || value === "中" || value === "低" ? value : "中");

const normalizeChecklist = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => item as Record<string, unknown>)
        .map((item, index) => ({
          order: Number.isFinite(Number(item.order)) ? Math.max(1, Math.floor(Number(item.order))) : index + 1,
          impactLevel: normalizeImpactLevel(pickString(item.impactLevel)),
          item: pickString(item.item),
          rationale: pickString(item.rationale)
        }))
        .filter((item) => item.item.length > 0)
        .slice(0, 12)
    : [];

export function parseBusinessConfirmationCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) ?? {};
  return {
    coreIntent: pickString((parsed as Record<string, unknown>).coreIntent),
    successCriteria: pickStringList((parsed as Record<string, unknown>).successCriteria, 12),
    interactionInsights: {
      primaryFlow: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.primaryFlow, 10),
      keyInteractions: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.keyInteractions, 12),
      exceptionPaths: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.exceptionPaths, 10),
      usabilityRisks: pickStringList(((parsed as Record<string, unknown>).interactionInsights as Record<string, unknown> | undefined)?.usabilityRisks, 10)
    },
    necessityAssessment: {
      mustDo: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.mustDo, 10),
      shouldDo: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.shouldDo, 10),
      canDefer: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.canDefer, 10),
      outOfScope: pickStringList(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.outOfScope, 10),
      rationale: pickString(((parsed as Record<string, unknown>).necessityAssessment as Record<string, unknown> | undefined)?.rationale)
    },
    evidenceRefs: pickStringList((parsed as Record<string, unknown>).evidenceRefs, 16),
    boundarySummary: pickString((parsed as Record<string, unknown>).boundarySummary),
    functionalPoints: pickStringList((parsed as Record<string, unknown>).functionalPoints, 16),
    confirmationChecklist: normalizeChecklist((parsed as Record<string, unknown>).confirmationChecklist),
    versionDiffSummary: pickString((parsed as Record<string, unknown>).versionDiffSummary),
    diffNarratives: pickStringList((parsed as Record<string, unknown>).diffNarratives, 16),
    diffConfirmationOrder: normalizeChecklist((parsed as Record<string, unknown>).diffConfirmationOrder)
  };
}

export function listBusinessConfirmationMissingReasons(candidate: ReturnType<typeof parseBusinessConfirmationCandidate>) {
  const reasons: string[] = [];
  if (!candidate.coreIntent) reasons.push("核心意图缺失");
  if (candidate.successCriteria.length === 0) reasons.push("成功标准为空");
  if (candidate.interactionInsights.primaryFlow.length === 0) reasons.push("主要交互流程为空");
  if (candidate.interactionInsights.keyInteractions.length === 0) reasons.push("关键交互为空");
  if (candidate.necessityAssessment.mustDo.length === 0 && candidate.necessityAssessment.shouldDo.length === 0 && candidate.necessityAssessment.canDefer.length === 0) {
    reasons.push("必要性评估无可执行项");
  }
  if (!candidate.necessityAssessment.rationale) reasons.push("必要性理由缺失");
  if (candidate.evidenceRefs.length === 0) reasons.push("证据引用为空");
  if (!candidate.boundarySummary) reasons.push("边界总结缺失");
  if (candidate.functionalPoints.length === 0) reasons.push("功能要点为空");
  if (candidate.confirmationChecklist.length === 0) reasons.push("确认清单为空");
  if (!candidate.versionDiffSummary) reasons.push("版本差异摘要缺失");
  if (candidate.diffNarratives.length === 0) reasons.push("差异叙述为空");
  if (candidate.diffConfirmationOrder.length === 0) reasons.push("差异确认顺序为空");
  return reasons;
}
