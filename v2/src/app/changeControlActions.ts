import type { Dispatch, SetStateAction } from "react";
import type {
  AttachmentAnalysisReport,
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
import { withBusyAction } from "../shared/withBusyAction";

export type ChangeControlActionDeps = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  currentRole: string;
  analysisReport: AttachmentAnalysisReport | null;
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
  await withBusyAction(deps, async () => {
    await transitionIterationState(deps.currentIteration!.id, { toStatus });
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
    await deps.loadIterationDetail(deps.currentIteration!.id);
    await deps.loadGovernance();
    deps.setStateMachine((prev) =>
      prev
        ? {
            ...prev,
            currentStatus: toStatus
          }
        : prev
    );
  });
};

export const handleUpdateClarificationDraft = async (resolvedQuestions: string[], deps: ChangeControlActionDeps) => {
  if (!deps.currentIteration) {
    return;
  }
  await withBusyAction(deps, async () => {
    await updateClarificationDraft(deps.currentIteration!.id, resolvedQuestions);
    await deps.loadIterationDetail(deps.currentIteration!.id);
    await deps.loadGovernance();
  });
};

export const handleConfirmIterationAnalysis = async (
  payload: {
    accurate: boolean;
    note?: string;
    force?: boolean;
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
  await withBusyAction(deps, async () => {
    // 确认前收集待澄清问题（确认后后端会清空 clarificationQuestions）
    const preConfirmQuestions: string[] = [];
    const ccQuestions = deps.currentIteration?.changeControl?.clarificationQuestions ?? [];
    preConfirmQuestions.push(...ccQuestions.filter(Boolean));
    if (preConfirmQuestions.length === 0 && deps.analysisReport) {
      const rq = deps.analysisReport.reportQuality;
      if (rq) {
        preConfirmQuestions.push(
          ...[...(rq.missingItems || []), ...(rq.actionRequired || [])]
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3)
        );
      }
      if (preConfirmQuestions.length === 0) {
        preConfirmQuestions.push(
          ...(deps.analysisReport.clarificationQuestions || []).filter(Boolean)
        );
      }
    }

    await confirmIterationAnalysis(deps.currentIteration!.id, {
      ...payload,
      actor: deps.currentRole
    });
    if (payload.decisionEvent === "understanding-accurate") {
      const created = await createIterationMessage(
        deps.currentIteration!.id,
        "system",
        `分析理解确认：理解准确。${payload.note?.trim() ? `备注：${payload.note.trim()}` : ""}`
      );
      deps.setChatMessages((prev) => [...prev, created]);
      // 确认后展示澄清问题引导
      if (preConfirmQuestions.length > 0) {
        const items = preConfirmQuestions.slice(0, 3);
        const listText = items.map((q, i) => `${i + 1}. ${q}`).join("\n");
        const guide = await createIterationMessage(
          deps.currentIteration!.id,
          "assistant",
          `分析已确认。我在分析过程中发现有 ${items.length} 处信息需要你补充：\n\n${listText}\n\n你可以逐条回复，也可以一次性说明。如果某项暂时没有结论，告诉我"先跳过"就行。`
        );
        deps.setChatMessages((prev) => [...prev, guide]);
      } else {
        const guide = await createIterationMessage(
          deps.currentIteration!.id,
          "assistant",
          "分析已确认，接下来可以继续推进。你可以直接说下一步想做什么，比如任务拆解、原型调整或技术方案。"
        );
        deps.setChatMessages((prev) => [...prev, guide]);
      }
    } else if (payload.decisionEvent === "understanding-inaccurate") {
      const created = await createIterationMessage(
        deps.currentIteration!.id,
        "system",
        `分析理解确认：理解不准确，已进入澄清流程。${payload.note?.trim() ? `备注：${payload.note.trim()}` : ""}`
      );
      deps.setChatMessages((prev) => [...prev, created]);
    }
    await deps.loadIterationDetail(deps.currentIteration!.id);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
    await deps.loadGovernance();
  });
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
  await withBusyAction(deps, async () => {
    await updateIterationBoundary(deps.currentIteration!.id, payload);
    await deps.loadIterationDetail(deps.currentIteration!.id);
    await deps.loadGovernance();
  });
};
