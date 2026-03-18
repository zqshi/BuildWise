import type { Dispatch, SetStateAction } from "react";
import type { Iteration } from "../domain/workspace/types";
import { recomputeAssessment, restoreAssessment } from "./workspaceApi";

export type AssessmentActionDeps = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export const handleRecomputeAssessment = async (deps: AssessmentActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    await recomputeAssessment(deps.currentIteration.id);
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};

export const handleRestoreSnapshot = async (snapshotId: number, deps: AssessmentActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    await restoreAssessment(deps.currentIteration.id, snapshotId);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};
