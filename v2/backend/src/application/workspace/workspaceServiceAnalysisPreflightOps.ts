import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

export function parseExecutionPolicyCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const riskRaw = pickString(parsed?.promptBudgetRisk).toLowerCase();
  const promptBudgetRisk: "low" | "medium" | "high" =
    riskRaw === "low" || riskRaw === "medium" || riskRaw === "high" ? riskRaw : "medium";
  return {
    degraded: Boolean(parsed?.degraded),
    reason: pickString(parsed?.reason),
    enforceSingleAgent: Boolean(parsed?.enforceSingleAgent),
    forceMultiAgent: Boolean(parsed?.forceMultiAgent),
    promptBudgetRisk
  };
}

export function listExecutionPolicyMissingReasons(candidate: ReturnType<typeof parseExecutionPolicyCandidate>) {
  const reasons: string[] = [];
  if (!candidate.reason) reasons.push("missing reason");
  if (candidate.enforceSingleAgent && candidate.forceMultiAgent) reasons.push("conflict enforceSingleAgent and forceMultiAgent");
  return reasons;
}

export function parseFolderSelectionCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  const includedPaths = pickStringList(parsed?.includedPaths, 800);
  const ignoredFiles = Array.isArray(parsed?.ignoredFiles)
    ? (parsed?.ignoredFiles as Array<Record<string, unknown>>)
        .map((item) => ({
          path: pickString(item.path),
          reason: pickString(item.reason)
        }))
        .filter((item) => item.path.length > 0)
        .slice(0, 400)
    : [];
  const sampleReason = pickString(parsed?.sampleReason);
  return { includedPaths, ignoredFiles, sampleReason };
}

export function listFolderSelectionMissingReasons(candidate: ReturnType<typeof parseFolderSelectionCandidate>) {
  const reasons: string[] = [];
  if (candidate.includedPaths.length === 0) reasons.push("includedPaths is empty");
  return reasons;
}
