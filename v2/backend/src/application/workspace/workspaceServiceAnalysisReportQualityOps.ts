import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

export function parseReportQualityCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const scoreRaw = Number(parsed?.score);
  return {
    publishable: Boolean(parsed?.publishable),
    score: Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : 0,
    summary: pickString(parsed?.summary),
    missingItems: pickStringList(parsed?.missingItems, 16),
    actionRequired: pickStringList(parsed?.actionRequired, 16)
  };
}

export function listReportQualityMissingReasons(candidate: ReturnType<typeof parseReportQualityCandidate>) {
  const reasons: string[] = [];
  if (!candidate.summary) reasons.push("missing summary");
  if (!Number.isFinite(candidate.score)) reasons.push("missing score");
  return reasons;
}
