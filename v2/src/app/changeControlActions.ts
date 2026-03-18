import type { Dispatch, SetStateAction } from "react";
import type {
  Iteration,
  IterationMessage,
  IterationStateMachinePayload,
  IterationStatus
} from "../domain/workspace/types";
import {
  confirmIterationAnalysis,
  createIterationMessage,
  transitionIterationState,
  updateClarificationDraft,
  updateIterationBoundary
} from "./workspaceApi";

export type ChangeControlActionDeps = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  currentRole: string;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export const handleTransitionState = async (toStatus: IterationStatus, deps: ChangeControlActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    await transitionIterationState(deps.currentIteration.id, { toStatus });
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
    deps.setStateMachine((prev) =>
      prev
        ? {
            ...prev,
            currentStatus: toStatus
          }
        : prev
    );
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};

export const handleUpdateClarificationDraft = async (resolvedQuestions: string[], deps: ChangeControlActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    await updateClarificationDraft(deps.currentIteration.id, resolvedQuestions);
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};

export const handleConfirmIterationAnalysis = async (
  payload: {
    accurate: boolean;
    note?: string;
    decisionEvent?: "understanding-accurate" | "understanding-inaccurate";
    resolvedClarificationQuestions?: string[];
    boundary?: {
      requirementRefs?: string[];
      componentRefs?: string[];
      codePaths?: string[];
      note?: string;
    };
  },
  deps: ChangeControlActionDeps
) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    await confirmIterationAnalysis(deps.currentIteration.id, {
      ...payload,
      actor: deps.currentRole
    });
    if (payload.decisionEvent === "understanding-accurate") {
      const created = await createIterationMessage(
        deps.currentIteration.id,
        "system",
        `分析理解确认：理解准确。${payload.note?.trim() ? `备注：${payload.note.trim()}` : ""}`
      );
      deps.setChatMessages((prev) => [...prev, created]);
    } else if (payload.decisionEvent === "understanding-inaccurate") {
      const created = await createIterationMessage(
        deps.currentIteration.id,
        "system",
        `分析理解确认：理解不准确，已进入澄清流程。${payload.note?.trim() ? `备注：${payload.note.trim()}` : ""}`
      );
      deps.setChatMessages((prev) => [...prev, created]);
    }
    await deps.loadIterationDetail(deps.currentIteration.id);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};

export const handleUpdateIterationBoundary = async (
  payload: {
    requirementRefs?: string[];
    componentRefs?: string[];
    codePaths?: string[];
    note?: string;
  },
  deps: ChangeControlActionDeps
) => {
  if (!deps.currentIteration) {
    return;
  }
  try {
    deps.setBusy(true);
    await updateIterationBoundary(deps.currentIteration.id, payload);
    await deps.loadIterationDetail(deps.currentIteration.id);
    await deps.loadGovernance();
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    deps.setBusy(false);
  }
};
