import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

const normalizeConfidence = (value: string): "high" | "medium" | "low" =>
  value === "high" || value === "medium" || value === "low" ? value : "medium";

export function parseAttachmentInsightsCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content) as Record<string, unknown> | null;
  return {
    projectCategory: pickString(parsed?.projectCategory),
    artifactType: pickString(parsed?.artifactType),
    keyCharacteristics: pickStringList(parsed?.keyCharacteristics, 12),
    versionChangeSummary: pickString(parsed?.versionChangeSummary),
    confidence: normalizeConfidence(pickString(parsed?.confidence)),
    limitations: pickStringList(parsed?.limitations, 12)
  };
}

export function listAttachmentInsightsMissingReasons(candidate: ReturnType<typeof parseAttachmentInsightsCandidate>) {
  const reasons: string[] = [];
  if (!candidate.projectCategory) reasons.push("missing projectCategory");
  if (!candidate.artifactType) reasons.push("missing artifactType");
  if (candidate.keyCharacteristics.length === 0) reasons.push("keyCharacteristics is empty");
  if (!candidate.versionChangeSummary) reasons.push("missing versionChangeSummary");
  return reasons;
}
