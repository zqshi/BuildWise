/**
 * Iteration recovery hook — localStorage-based crash recovery for analysis state.
 */

export function analysisReportCacheKey(iterationId: number | null): string {
  return `buildwise:analysisReport:${iterationId ?? "none"}`;
}

export function uploadedAttachmentCacheKey(iterationId: number | null): string {
  return `buildwise:uploadedAttachment:${iterationId ?? "none"}`;
}

export function useIterationRecovery(_deps: Record<string, unknown>) {
  // Placeholder — recovery logic will be implemented
}
