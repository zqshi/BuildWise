import type { Dispatch, SetStateAction } from "react";
import type { Iteration, IterationMessage } from "../domain/workspace/types";
import {
  appendIterationArtifactToChat,
  commitIterationArtifact,
  confirmIterationArtifact,
  saveIterationArtifactDraft,
  transitionIterationArtifactStage
} from "./workspaceApi";
import { withBusyAction } from "../shared/withBusyAction";

export type ArtifactActionDeps = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
};

export const handleSaveArtifactDraft = async (
  artifactId: string,
  payload: { content: string; media?: string[]; actor?: string },
  deps: ArtifactActionDeps
) => {
  if (!deps.currentIteration) return;
  await withBusyAction(deps, async () => {
    await saveIterationArtifactDraft(deps.currentIteration!.id, artifactId, payload);
    await deps.loadIterationDetail(deps.currentIteration!.id);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
  });
};

export const handleCommitArtifact = async (
  artifactId: string,
  payload: { actor?: string; summary?: string; evidence?: string[]; source?: string },
  deps: ArtifactActionDeps
) => {
  if (!deps.currentIteration) return;
  await withBusyAction(deps, async () => {
    await commitIterationArtifact(deps.currentIteration!.id, artifactId, payload);
    await deps.loadIterationDetail(deps.currentIteration!.id);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
  });
};

export const handleConfirmArtifact = async (
  artifactId: string,
  payload: { actor?: string; passed?: boolean; note?: string },
  deps: ArtifactActionDeps
) => {
  if (!deps.currentIteration) return;
  await withBusyAction(deps, async () => {
    await confirmIterationArtifact(deps.currentIteration!.id, artifactId, payload);
    await deps.loadIterationDetail(deps.currentIteration!.id);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
  });
};

export const handleAppendArtifactToChat = async (
  artifactId: string,
  deps: ArtifactActionDeps,
  payload?: { actor?: string; prompt?: string }
) => {
  if (!deps.currentIteration) return;
  await withBusyAction(deps, async () => {
    try {
      const result = await appendIterationArtifactToChat(deps.currentIteration!.id, artifactId, payload);
      if (result?.message) {
        deps.setChatMessages((prev) => [...prev, result.message]);
      }
    } catch {
      // 后端拒绝发布（内容未就绪）时静默处理，不视为错误
      deps.setError("该交付物内容尚未生成，请等待分析完成后再发布到对话。");
    }
  });
};

export const handleTransitionArtifactStage = async (
  payload: { toStage: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive"; actor?: string; note?: string },
  deps: ArtifactActionDeps
) => {
  if (!deps.currentIteration) return;
  await withBusyAction(deps, async () => {
    await transitionIterationArtifactStage(deps.currentIteration!.id, payload);
    await deps.loadIterationDetail(deps.currentIteration!.id);
    if (deps.currentProjectId) {
      await deps.loadIterations(deps.currentProjectId);
    }
  });
};
