import { parseJsonObjectFromText, pickString, pickStringList } from "./workspaceAnalysisExtractors";

export function parseProjectProfileCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const rawProject = (parsed?.projectDetection ?? {}) as Record<string, unknown>;
  const projectName = pickString(rawProject.projectName);
  const productName = pickString(rawProject.productName);
  const projectCategory = pickString(rawProject.projectCategory);
  const evidence = pickStringList(rawProject.evidence, 4);
  const meaningfulFindings = pickStringList(parsed?.meaningfulFindings, 8);
  const prioritizedFindings = parsePrioritizedFindingsFromText(content);
  const nextActions = pickStringList(parsed?.nextActions, 6);
  return { projectName, productName, projectCategory, evidence, meaningfulFindings, prioritizedFindings, nextActions };
}

export function listProjectProfileMissingReasons(candidate: ReturnType<typeof parseProjectProfileCandidate>) {
  const reasons: string[] = [];
  if (!candidate.projectName && !candidate.productName) reasons.push("missing projectDetection.projectName/productName");
  if (candidate.meaningfulFindings.length === 0) reasons.push("meaningfulFindings is empty");
  if (candidate.prioritizedFindings.length === 0) reasons.push("prioritizedFindings is empty");
  if (candidate.nextActions.length === 0) reasons.push("nextActions is empty");
  return reasons;
}

export function parsePrioritizedFindingsFromText(content: string) {
  const parsed = parseJsonObjectFromText(content);
  return Array.isArray(parsed?.prioritizedFindings)
    ? parsed.prioritizedFindings
        .map((item) => item as Record<string, unknown>)
        .map((item) => ({
          priority: pickString(item.priority) as "P0" | "P1" | "P2",
          content: pickString(item.content),
          reason: pickString(item.reason)
        }))
        .filter((item) => (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && item.content)
        .slice(0, 8)
    : [];
}

export function parseProjectDetectionFromText(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const rawProject = (parsed?.projectDetection ?? {}) as Record<string, unknown>;
  return {
    projectName: pickString(rawProject.projectName),
    productName: pickString(rawProject.productName),
    projectCategory: pickString(rawProject.projectCategory),
    evidence: pickStringList(rawProject.evidence, 4)
  };
}
