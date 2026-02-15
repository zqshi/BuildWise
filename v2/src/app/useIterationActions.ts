import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type {
  AttachmentAnalysisReport,
  ChatRole,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  IterationStateMachinePayload,
  IterationStatus
} from "../domain/workspace/types";
import {
  analyzeIterationAttachment,
  createIterationMessage,
  recomputeAssessment,
  restoreAssessment,
  transitionIterationState
} from "./workspaceApi";
import { buildAssistantReply } from "./workspaceHelpers";

type UseIterationActionsParams = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  contextData: IterationContextPayload | null;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setUploadedFile: Dispatch<SetStateAction<{ name: string; iterationId: number } | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setAnalysisReport: Dispatch<SetStateAction<AttachmentAnalysisReport | null>>;
  setShowAnalysisPanel: Dispatch<SetStateAction<boolean>>;
  setIsAnalyzingAttachment: Dispatch<SetStateAction<boolean>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export function useIterationActions({
  currentIteration,
  currentProjectId,
  contextData,
  chatInput,
  fileInputRef,
  setChatInput,
  setBusy,
  setError,
  setUploadedFile,
  setChatMessages,
  setStateMachine,
  setAnalysisReport,
  setShowAnalysisPanel,
  setIsAnalyzingAttachment,
  loadIterationDetail,
  loadIterations,
  loadGovernance
}: UseIterationActionsParams) {
  const handleUploadClick = () => {
    if (!currentIteration) {
      return;
    }
    fileInputRef.current?.click();
  };

  const appendMessageLocal = (message: IterationMessage) => {
    setChatMessages((prev) => [...prev, message]);
  };

  const createMessage = async (iterationId: number, role: ChatRole, content: string) => {
    const created = await createIterationMessage(iterationId, role, content);
    appendMessageLocal(created);
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!currentIteration) {
      event.target.value = "";
      return;
    }
    setUploadedFile({ name: file.name, iterationId: currentIteration.id });
    try {
      setIsAnalyzingAttachment(true);
      const report = await analyzeIterationAttachment(currentIteration.id, file);
      setAnalysisReport(report);
      setShowAnalysisPanel(false);
      await createMessage(currentIteration.id, "system", `已上传附件：${file.name}`);
      await createMessage(
        currentIteration.id,
        "assistant",
        "附件已完成大模型分析，点击“查看分析报告”可查看理解结果与版本差异。"
      );
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAnalyzingAttachment(false);
      event.target.value = "";
    }
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || !currentIteration) {
      return;
    }
    setChatInput("");
    try {
      await createMessage(currentIteration.id, "user", text);
      const reply = buildAssistantReply(text, contextData?.scope);
      await createMessage(currentIteration.id, "assistant", reply);
      await loadIterationDetail(currentIteration.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRecomputeAssessment = async () => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await recomputeAssessment(currentIteration.id);
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: number) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await restoreAssessment(currentIteration.id, snapshotId);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleTransitionState = async (toStatus: IterationStatus) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await transitionIterationState(currentIteration.id, { toStatus });
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
      setStateMachine((prev) =>
        prev
          ? {
              ...prev,
              currentStatus: toStatus
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return {
    handleUploadClick,
    handleUpload,
    handleSend,
    handleRecomputeAssessment,
    handleRestoreSnapshot,
    handleTransitionState
  };
}
