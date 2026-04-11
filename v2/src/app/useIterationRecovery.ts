/**
 * Iteration recovery hook — localStorage-based crash recovery for analysis state.
 *
 * Write-side: uploadActions.ts writes to localStorage after setUploadedFile / setAnalysisReport.
 * Read-side: useAppController.ts reads from localStorage on iteration switch.
 * Cleanup: this hook removes stale keys for iterations other than the active one.
 */

import { useEffect } from "react";

export function analysisReportCacheKey(iterationId: number | null): string {
  return `buildwise:analysisReport:${iterationId ?? "none"}`;
}

export function uploadedAttachmentCacheKey(iterationId: number | null): string {
  return `buildwise:uploadedAttachment:${iterationId ?? "none"}`;
}

const CACHE_KEY_PREFIX_REPORT = "buildwise:analysisReport:";
const CACHE_KEY_PREFIX_UPLOAD = "buildwise:uploadedAttachment:";

/**
 * Cleans up localStorage entries for iterations other than `activeIterationId`.
 * Keeps at most the current iteration's cache to avoid unbounded growth.
 */
function purgeStaleIterationCaches(activeIterationId: number | null) {
  try {
    const activeSuffix = String(activeIterationId ?? "none");
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isReport = key.startsWith(CACHE_KEY_PREFIX_REPORT);
      const isUpload = key.startsWith(CACHE_KEY_PREFIX_UPLOAD);
      if (!isReport && !isUpload) continue;
      const prefix = isReport ? CACHE_KEY_PREFIX_REPORT : CACHE_KEY_PREFIX_UPLOAD;
      const suffix = key.slice(prefix.length);
      if (suffix !== activeSuffix) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* localStorage access can throw in private browsing — non-critical */
  }
}

export function useIterationRecovery(deps: { currentIterationId: number | null }) {
  useEffect(() => {
    purgeStaleIterationCaches(deps.currentIterationId);
  }, [deps.currentIterationId]);
}
