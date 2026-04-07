import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

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
  if (!candidate.coreIntent) reasons.push("missing coreIntent");
  if (candidate.successCriteria.length === 0) reasons.push("successCriteria is empty");
  if (candidate.interactionInsights.primaryFlow.length === 0) reasons.push("interactionInsights.primaryFlow is empty");
  if (candidate.interactionInsights.keyInteractions.length === 0) reasons.push("interactionInsights.keyInteractions is empty");
  if (candidate.necessityAssessment.mustDo.length === 0 && candidate.necessityAssessment.shouldDo.length === 0 && candidate.necessityAssessment.canDefer.length === 0) {
    reasons.push("necessityAssessment has no actionable items");
  }
  if (!candidate.necessityAssessment.rationale) reasons.push("missing necessityAssessment.rationale");
  if (candidate.evidenceRefs.length === 0) reasons.push("evidenceRefs is empty");
  if (!candidate.boundarySummary) reasons.push("missing boundarySummary");
  if (candidate.functionalPoints.length === 0) reasons.push("functionalPoints is empty");
  if (candidate.confirmationChecklist.length === 0) reasons.push("confirmationChecklist is empty");
  if (!candidate.versionDiffSummary) reasons.push("missing versionDiffSummary");
  if (candidate.diffNarratives.length === 0) reasons.push("diffNarratives is empty");
  if (candidate.diffConfirmationOrder.length === 0) reasons.push("diffConfirmationOrder is empty");
  return reasons;
}
