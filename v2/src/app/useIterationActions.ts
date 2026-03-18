import { useRef, useState } from "react";
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type {
  AttachmentAnalysisReport,
  ChatSendStatus,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  IterationStateMachinePayload,
  IterationStatus,
  IterationVisualEditResponse
} from "../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";

import {
  handleUploadClick as handleUploadClickFn,
  uploadFiles as uploadFilesFn,
  handleUpload as handleUploadFn,
  handleRetryUpload as handleRetryUploadFn,
  type UploadActionDeps
} from "./uploadActions";
import {
  handleSend as handleSendFn,
  type ChatActionDeps
} from "./chatActions";
import {
  handleRecomputeAssessment as handleRecomputeAssessmentFn,
  handleRestoreSnapshot as handleRestoreSnapshotFn,
  type AssessmentActionDeps
} from "./assessmentActions";
import {
  handleTransitionState as handleTransitionStateFn,
  handleUpdateClarificationDraft as handleUpdateClarificationDraftFn,
  handleConfirmIterationAnalysis as handleConfirmIterationAnalysisFn,
  handleUpdateIterationBoundary as handleUpdateIterationBoundaryFn,
  type ChangeControlActionDeps
} from "./changeControlActions";
import {
  handleUpdateTestMatrixExecution as handleUpdateTestMatrixExecutionFn,
  handleGenerateTestArtifacts as handleGenerateTestArtifactsFn,
  handleRefreshReleaseReview as handleRefreshReleaseReviewFn,
  type QualityActionDeps
} from "./qualityActions";
import {
  handleSaveArtifactDraft as handleSaveArtifactDraftFn,
  handleCommitArtifact as handleCommitArtifactFn,
  handleConfirmArtifact as handleConfirmArtifactFn,
  handleAppendArtifactToChat as handleAppendArtifactToChatFn,
  handleTransitionArtifactStage as handleTransitionArtifactStageFn,
  type ArtifactActionDeps
} from "./artifactActions";

type UseIterationActionsParams = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  currentRole: string;
  contextData: IterationContextPayload | null;
  analysisReport: AttachmentAnalysisReport | null;
  uploadedFile: UploadedAttachmentMeta | null;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setChatSendStatus: Dispatch<SetStateAction<ChatSendStatus>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setUploadedFile: Dispatch<SetStateAction<UploadedAttachmentMeta | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setAnalysisReport: Dispatch<SetStateAction<AttachmentAnalysisReport | null>>;
  setShowAnalysisPanel: Dispatch<SetStateAction<boolean>>;
  setIsAnalyzingAttachment: Dispatch<SetStateAction<boolean>>;
  setUploadAnalysisProgress: Dispatch<SetStateAction<UploadAnalysisProgress | null>>;
  setUploadToastMessage: Dispatch<SetStateAction<string | null>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export function useIterationActions({
  currentIteration,
  currentProjectId,
  currentRole,
  // contextData is kept in the params signature for API compatibility but is not directly
  // consumed inside this orchestrator any more — the sub-modules receive only what they need.
  contextData: _contextData,
  analysisReport,
  uploadedFile,
  chatInput,
  fileInputRef,
  setChatInput,
  setChatSendStatus,
  setBusy,
  setError,
  setUploadedFile,
  setChatMessages,
  setStateMachine,
  setAnalysisReport,
  setShowAnalysisPanel,
  setIsAnalyzingAttachment,
  setUploadAnalysisProgress,
  setUploadToastMessage,
  loadIterationDetail,
  loadIterations,
  loadGovernance
}: UseIterationActionsParams) {
  const lastUploadAttemptRef = useRef<{ iterationId: number; files: File[] } | null>(null);
  const [lastUploadFailed, setLastUploadFailed] = useState(false);

  /* ── shared dep bags ─────────────────────────────────────────────── */

  const uploadDeps: UploadActionDeps = {
    currentIteration,
    currentProjectId,
    setLastUploadFailed,
    lastUploadAttemptRef,
    setError,
    setUploadedFile,
    setUploadToastMessage,
    setIsAnalyzingAttachment,
    setUploadAnalysisProgress,
    setAnalysisReport,
    setShowAnalysisPanel,
    setChatMessages,
    loadIterations,
    loadGovernance
  };

  const chatDeps: ChatActionDeps = {
    currentIteration,
    currentProjectId,
    currentRole,
    chatInput,
    analysisReport,
    uploadedFile,
    setChatInput,
    setChatSendStatus,
    setError,
    setChatMessages,
    loadIterationDetail,
    loadIterations,
    loadGovernance
  };

  const assessmentDeps: AssessmentActionDeps = {
    currentIteration,
    currentProjectId,
    setBusy,
    setError,
    loadIterationDetail,
    loadIterations,
    loadGovernance
  };

  const changeControlDeps: ChangeControlActionDeps = {
    currentIteration,
    currentProjectId,
    currentRole,
    setBusy,
    setError,
    setStateMachine,
    setChatMessages,
    loadIterationDetail,
    loadIterations,
    loadGovernance
  };

  const qualityDeps: QualityActionDeps = {
    currentIteration,
    setBusy,
    setError,
    setAnalysisReport,
    setChatMessages,
    loadIterationDetail,
    loadGovernance
  };

  const artifactDeps: ArtifactActionDeps = {
    currentIteration,
    currentProjectId,
    setBusy,
    setError,
    setChatMessages,
    loadIterationDetail,
    loadIterations
  };

  /* ── thin wrappers that close over the dep bags ──────────────────── */

  const handleUploadClick = () => handleUploadClickFn(currentIteration, fileInputRef);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => handleUploadFn(event, uploadDeps);

  const uploadFilesWrapped = (files: File[]) => uploadFilesFn(files, uploadDeps);

  const handleRetryUpload = () => handleRetryUploadFn(uploadDeps);

  const handleSend = (options?: {
    overrideText?: string;
    prototypeTarget?: string | null;
    prototypeSummary?: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }): Promise<IterationVisualEditResponse | null> => handleSendFn(chatDeps, options);

  const handleRecomputeAssessment = () => handleRecomputeAssessmentFn(assessmentDeps);

  const handleRestoreSnapshot = (snapshotId: number) => handleRestoreSnapshotFn(snapshotId, assessmentDeps);

  const handleTransitionState = (toStatus: IterationStatus) => handleTransitionStateFn(toStatus, changeControlDeps);

  const handleUpdateClarificationDraft = (resolvedQuestions: string[]) =>
    handleUpdateClarificationDraftFn(resolvedQuestions, changeControlDeps);

  const handleConfirmIterationAnalysis = (payload: {
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
  }) => handleConfirmIterationAnalysisFn(payload, changeControlDeps);

  const handleUpdateIterationBoundary = (payload: {
    requirementRefs?: string[];
    componentRefs?: string[];
    codePaths?: string[];
    note?: string;
  }) => handleUpdateIterationBoundaryFn(payload, changeControlDeps);

  const handleUpdateTestMatrixExecution = (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => handleUpdateTestMatrixExecutionFn(updates, qualityDeps);

  const handleGenerateTestArtifacts = () => handleGenerateTestArtifactsFn(qualityDeps);

  const handleRefreshReleaseReview = () => handleRefreshReleaseReviewFn(qualityDeps);

  const handleSaveArtifactDraft = (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) =>
    handleSaveArtifactDraftFn(artifactId, payload, artifactDeps);

  const handleCommitArtifact = (
    artifactId: string,
    payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }
  ) => handleCommitArtifactFn(artifactId, payload, artifactDeps);

  const handleConfirmArtifact = (artifactId: string, payload: { actor?: string; passed?: boolean; note?: string }) =>
    handleConfirmArtifactFn(artifactId, payload, artifactDeps);

  const handleAppendArtifactToChat = (artifactId: string, payload?: { actor?: string; prompt?: string }) =>
    handleAppendArtifactToChatFn(artifactId, artifactDeps, payload);

  const handleTransitionArtifactStage = (
    payload: { toStage: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive"; actor?: string; note?: string }
  ) => handleTransitionArtifactStageFn(payload, artifactDeps);

  return {
    handleUploadClick,
    handleUpload,
    uploadFiles: uploadFilesWrapped,
    handleRetryUpload,
    lastUploadFailed,
    handleSend,
    handleRecomputeAssessment,
    handleRestoreSnapshot,
    handleTransitionState,
    handleUpdateClarificationDraft,
    handleConfirmIterationAnalysis,
    handleUpdateIterationBoundary,
    handleUpdateTestMatrixExecution,
    handleGenerateTestArtifacts,
    handleRefreshReleaseReview,
    handleSaveArtifactDraft,
    handleCommitArtifact,
    handleConfirmArtifact,
    handleAppendArtifactToChat,
    handleTransitionArtifactStage
  };
}
