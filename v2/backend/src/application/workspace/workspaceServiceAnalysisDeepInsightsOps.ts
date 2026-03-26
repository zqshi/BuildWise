import { normalizeConfidence, parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

const normalizeKind = (value: string): "document" | "code" | "image" | "prototype" | "binary" =>
  value === "document" || value === "code" || value === "image" || value === "prototype" || value === "binary" ? value : "document";
const normalizeStatus = (value: string): "analyzed" | "partial" | "failed" =>
  value === "analyzed" || value === "partial" || value === "failed" ? value : "partial";

export function parseDeepInsightsCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const coverageRaw = (parsed?.coverage ?? {}) as Record<string, unknown>;
  const fileInsightsRaw = Array.isArray(parsed?.fileInsights) ? (parsed?.fileInsights as Array<Record<string, unknown>>) : [];
  const fileInsights = fileInsightsRaw
    .map((item) => ({
      path: pickString(item.path),
      fileName: pickString(item.fileName),
      mimeType: pickString(item.mimeType) || "application/octet-stream",
      size: Number.isFinite(Number(item.size)) ? Math.max(0, Math.floor(Number(item.size))) : 0,
      kind: normalizeKind(pickString(item.kind)),
      status: normalizeStatus(pickString(item.status)),
      mainContent: pickString(item.mainContent),
      requiredWork: pickString(item.requiredWork),
      iterationValue: pickString(item.iterationValue),
      summary: pickString(item.summary),
      keyPoints: pickStringList(item.keyPoints, 8),
      risks: pickStringList(item.risks, 6),
      optimizeItems: pickStringList(item.optimizeItems, 8),
      keepItems: pickStringList(item.keepItems, 8),
      recommendedActions: pickStringList(item.recommendedActions, 8),
      openQuestions: pickStringList(item.openQuestions, 6),
      citations: pickStringList(item.citations, 6),
      confidence: normalizeConfidence(pickString(item.confidence))
    }))
    .filter((item) => item.path.length > 0 || item.fileName.length > 0)
    .slice(0, 300);
  const consideredFiles = Number.isFinite(Number(coverageRaw.consideredFiles)) ? Math.max(0, Math.floor(Number(coverageRaw.consideredFiles))) : fileInsights.length;
  const analyzedFiles = fileInsights.filter((item) => item.status === "analyzed").length;
  const partialFiles = fileInsights.filter((item) => item.status === "partial").length;
  const failedFiles = fileInsights.filter((item) => item.status === "failed").length;
  const coveragePercent = consideredFiles === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((analyzedFiles + partialFiles) / consideredFiles) * 100)));
  const crossRaw = (parsed?.crossFileInsights ?? {}) as Record<string, unknown>;
  return {
    coverage: {
      consideredFiles,
      analyzedFiles,
      partialFiles,
      failedFiles,
      coveragePercent
    },
    fileInsights,
    crossFileInsights: {
      themes: pickStringList(crossRaw.themes, 16),
      conflicts: pickStringList(crossRaw.conflicts, 16),
      gaps: pickStringList(crossRaw.gaps, 16),
      recommendations: pickStringList(crossRaw.recommendations, 16),
      conflictChains: pickStringList(crossRaw.conflictChains, 16),
      rootCauses: pickStringList(crossRaw.rootCauses, 16),
      impactScope: pickStringList(crossRaw.impactScope, 16),
      decisionSuggestions: pickStringList(crossRaw.decisionSuggestions, 16)
    }
  };
}

export function listDeepInsightsMissingReasons(candidate: ReturnType<typeof parseDeepInsightsCandidate>) {
  const reasons: string[] = [];
  if (candidate.fileInsights.length === 0) reasons.push("fileInsights is empty");
  if (
    candidate.fileInsights.some(
      (item) =>
        item.status === "analyzed" &&
        (!item.mainContent || !item.requiredWork || !item.iterationValue || item.recommendedActions.length === 0)
    )
  ) {
    reasons.push("fileInsights missing mainContent/requiredWork/iterationValue/recommendedActions");
  }
  if (candidate.crossFileInsights.themes.length === 0 && candidate.crossFileInsights.gaps.length === 0) {
    reasons.push("crossFileInsights missing themes/gaps");
  }
  if (candidate.crossFileInsights.rootCauses.length === 0) {
    reasons.push("crossFileInsights missing rootCauses");
  }
  if (candidate.crossFileInsights.decisionSuggestions.length === 0) {
    reasons.push("crossFileInsights missing decisionSuggestions");
  }
  return reasons;
}
