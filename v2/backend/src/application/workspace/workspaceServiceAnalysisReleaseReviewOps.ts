import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

export function parseReleaseReviewCandidate(
  content: string,
  fallbackSignals: {
    testCaseCount: number;
    p0FindingCount: number;
    unknownSignalCount: number;
    boundaryCoverage: number;
  }
) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const rollbackRaw = (parsed?.rollback ?? {}) as Record<string, unknown>;
  const signalsRaw = (parsed?.qualitySignals ?? {}) as Record<string, unknown>;
  const decisionRaw = pickString((parsed?.decision as string) || "");
  const decision: "go" | "caution" | "block" = decisionRaw === "go" || decisionRaw === "caution" || decisionRaw === "block" ? decisionRaw : "caution";
  return {
    decision,
    reason: pickString(parsed?.reason),
    score: Number.isFinite(Number(parsed?.score)) ? Math.max(0, Math.min(100, Math.round(Number(parsed?.score)))) : 0,
    blockers: pickStringList(parsed?.blockers, 16),
    releaseGates: pickStringList(parsed?.releaseGates, 16),
    recommendations: pickStringList(parsed?.recommendations, 16),
    rollback: {
      shouldRollback: Boolean(rollbackRaw.shouldRollback),
      reason: pickString(rollbackRaw.reason),
      trigger: pickString(rollbackRaw.trigger),
      actions: pickStringList(rollbackRaw.actions, 16)
    },
    qualitySignals: {
      testCaseCount: Number.isFinite(Number(signalsRaw.testCaseCount)) ? Math.max(0, Math.round(Number(signalsRaw.testCaseCount))) : fallbackSignals.testCaseCount,
      p0FindingCount: Number.isFinite(Number(signalsRaw.p0FindingCount)) ? Math.max(0, Math.round(Number(signalsRaw.p0FindingCount))) : fallbackSignals.p0FindingCount,
      unknownSignalCount: Number.isFinite(Number(signalsRaw.unknownSignalCount))
        ? Math.max(0, Math.round(Number(signalsRaw.unknownSignalCount)))
        : fallbackSignals.unknownSignalCount,
      boundaryCoverage: Number.isFinite(Number(signalsRaw.boundaryCoverage))
        ? Math.max(0, Math.min(100, Math.round(Number(signalsRaw.boundaryCoverage))))
        : fallbackSignals.boundaryCoverage
    }
  };
}

export function listReleaseReviewMissingReasons(candidate: ReturnType<typeof parseReleaseReviewCandidate>) {
  const reasons: string[] = [];
  if (!candidate.reason) reasons.push("missing reason");
  if (candidate.blockers.length === 0 && candidate.decision === "block") reasons.push("block decision without blockers");
  if (candidate.recommendations.length === 0) reasons.push("recommendations is empty");
  return reasons;
}
