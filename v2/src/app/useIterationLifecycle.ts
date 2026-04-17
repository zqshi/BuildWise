import { useEffect, useRef } from "react";
import type { UploadedAttachmentMeta, AttachmentAnalysisReport } from "../domain/workspace/types";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";
import { analysisReportCacheKey, uploadedAttachmentCacheKey } from "./useIterationRecovery";
import type { useWorkspaceState } from "./useWorkspaceState";
import type { useWorkspaceLoaders } from "./useWorkspaceLoaders";
import type { useWorkspaceDerived } from "./useWorkspaceDerived";

type IterationLifecycleParams = {
  state: ReturnType<typeof useWorkspaceState>;
  loaders: ReturnType<typeof useWorkspaceLoaders>;
  derived: ReturnType<typeof useWorkspaceDerived>;
};

/**
 * 迭代切换生命周期：清理旧状态 + 恢复本地缓存 + 加载迭代详情。
 */
export function useIterationLifecycle({
  state,
  loaders,
  derived,
}: IterationLifecycleParams): void {
  const iterationExistsInList =
    derived.currentIteration !== null && derived.currentIteration.id === state.currentIterationId;
  const prevIterIdRef = useRef(state.currentIterationId);

  useEffect(() => {
    const iterIdChanged = prevIterIdRef.current !== state.currentIterationId;
    prevIterIdRef.current = state.currentIterationId;

    if (!state.currentIterationId || !iterationExistsInList) {
      if (state.isAnalyzingAttachment) return;
      clearIterationState(state);
      return;
    }
    if (state.isAnalyzingAttachment) return;
    resetIterationTransientState(state, iterIdChanged);
    restoreCachedUpload(state);
    restoreCachedReport(state);
    loadIterationDetail(state, loaders);
  }, [state.currentIterationId, state.currentProjectId, iterationExistsInList]);
}

function clearIterationState(state: IterationLifecycleParams["state"]): void {
  state.setChatMessages([]);
  state.setChatSendStatus("idle");
  state.setUploadedFile(null);
  state.setContextData(null);
  state.setAssessmentData(null);
  state.setAssessmentHistory([]);
  state.setStateMachine(null);
  state.setAnalysisReport(null);
  state.setShowAnalysisPanel(false);
  state.setIsAnalyzingAttachment(false);
  state.setUploadAnalysisProgress(null);
  state.setUploadToastMessage(null);
}

function resetIterationTransientState(
  state: IterationLifecycleParams["state"],
  iterIdChanged: boolean,
): void {
  state.setChatSendStatus((prev) => {
    if (iterIdChanged) return "idle";
    if (prev === "processing-artifacts" || prev === "processing-full-cycle") return prev;
    return "idle";
  });
  state.setUploadAnalysisProgress(null);
  state.setUploadToastMessage(null);
  state.setUploadedFile(null);
  state.setAnalysisReport(null);
  state.setShowAnalysisPanel(false);
  state.setIsAnalyzingAttachment(false);
}

function restoreCachedUpload(state: IterationLifecycleParams["state"]): void {
  try {
    const raw = localStorage.getItem(uploadedAttachmentCacheKey(state.currentIterationId!));
    if (!raw) return;
    const parsed = JSON.parse(raw) as UploadedAttachmentMeta;
    if (parsed && typeof parsed === "object" && parsed.iterationId === state.currentIterationId) {
      state.setUploadedFile(parsed);
    }
  } catch (err) {
    console.debug("[AppController] failed to parse upload cache from localStorage", err);
  }
}

function restoreCachedReport(state: IterationLifecycleParams["state"]): void {
  try {
    const raw = localStorage.getItem(analysisReportCacheKey(state.currentIterationId!));
    if (!raw) return;
    const parsed = JSON.parse(raw) as AttachmentAnalysisReport;
    if (parsed && typeof parsed === "object" && parsed.iterationId === state.currentIterationId) {
      state.setAnalysisReport(parsed);
    }
  } catch (err) {
    console.debug("[AppController] failed to parse analysis report cache from localStorage", err);
  }
}

function loadIterationDetail(
  state: IterationLifecycleParams["state"],
  loaders: IterationLifecycleParams["loaders"],
): void {
  loaders.loadIterationDetail(state.currentIterationId!).catch(async (err) => {
    const message = resolveErrorMessage(err);
    if (message.includes("401")) return;
    if (/^API error: 404\b/.test(message)) {
      if (state.currentProjectId) {
        try { await loaders.loadIterations(state.currentProjectId); } catch { /* noop */ }
      }
      return;
    }
    state.setError(message);
  });
}
