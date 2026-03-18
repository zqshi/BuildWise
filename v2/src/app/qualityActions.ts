import type { Dispatch, SetStateAction } from "react";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationMessage
} from "../domain/workspace/types";
import {
  createIterationMessage,
  fetchIterationReleaseReview,
  generateIterationTestArtifacts,
  updateIterationTestMatrixExecution
} from "./workspaceApi";

export type QualityActionDeps = {
  currentIteration: Iteration | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setAnalysisReport: Dispatch<SetStateAction<AttachmentAnalysisReport | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export const handleUpdateTestMatrixExecution = async (
  updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>,
  deps: QualityActionDeps
) => {
  if (!deps.currentIteration || updates.length === 0) {
    return;
  }
  try {
    deps.setBusy(true);
    await updateIterationTestMatrixExecution(deps.currentIteration.id, updates);
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};

export const handleGenerateTestArtifacts = async (deps: QualityActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    const result = await generateIterationTestArtifacts(deps.currentIteration.id);
    deps.setAnalysisReport((prev) =>
      prev
        ? {
            ...prev,
            qualityArtifacts: {
              ...prev.qualityArtifacts,
              materializedFiles: result.generatedFiles
            }
          }
        : prev
    );
    const created = await createIterationMessage(
      deps.currentIteration.id,
      "assistant",
      `${result.summary}\n产物文件：${result.generatedFiles.join("；") || "无"}`
    );
    deps.setChatMessages((prev) => [...prev, created]);
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};

export const handleRefreshReleaseReview = async (deps: QualityActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    const review = await fetchIterationReleaseReview(deps.currentIteration.id);
    deps.setAnalysisReport((prev) =>
      prev
        ? {
            ...prev,
            releaseReview: {
              decision: review.decision,
              reason: `score=${review.score}; ${review.blockers[0] || review.warnings[0] || "无明显阻断"}`,
              blockers: review.blockers,
              releaseGates: [],
              recommendations: review.recommendations,
              rollback: review.rollback,
              qualitySignals: {
                testCaseCount: prev.releaseReview?.qualitySignals?.testCaseCount || 0,
                p0FindingCount: prev.releaseReview?.qualitySignals?.p0FindingCount || 0,
                unknownSignalCount: prev.releaseReview?.qualitySignals?.unknownSignalCount || 0,
                boundaryCoverage: review.evidence.boundaryReady ? 100 : 60
              }
            }
          }
        : prev
    );
    const created = await createIterationMessage(
      deps.currentIteration.id,
      "assistant",
      `发布评审刷新：${review.decision.toUpperCase()}（score=${review.score}）`
    );
    deps.setChatMessages((prev) => [...prev, created]);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};
