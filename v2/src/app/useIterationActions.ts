import { useRef, useState } from "react";
import type { ChangeEvent, Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
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
import { cancelFullCycleJob } from "./workspaceApi";
import type { FullCycleJobRef } from "../contexts/ChatContext";

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
import { handleResumeFullCycle as handleResumeFullCycleFn } from "./chatActionFullCycle";
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
  fullCycleJob: FullCycleJobRef | null;
  setFullCycleJob: Dispatch<SetStateAction<FullCycleJobRef | null>>;
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

/* ── pure dep-bag builders (module-level, no hooks) ─────────────────── */

function buildUploadDeps(
  p: Pick<UseIterationActionsParams,
    "currentIteration" | "currentProjectId" | "setError" | "setUploadedFile" |
    "setUploadToastMessage" | "setIsAnalyzingAttachment" | "setUploadAnalysisProgress" |
    "setAnalysisReport" | "setShowAnalysisPanel" | "setChatMessages" |
    "loadIterations" | "loadGovernance">,
  setLastUploadFailed: Dispatch<SetStateAction<boolean>>,
  lastUploadAttemptRef: MutableRefObject<{ iterationId: number; files: File[] } | null>
): UploadActionDeps {
  return {
    currentIteration: p.currentIteration,
    currentProjectId: p.currentProjectId,
    setLastUploadFailed,
    lastUploadAttemptRef,
    setError: p.setError,
    setUploadedFile: p.setUploadedFile,
    setUploadToastMessage: p.setUploadToastMessage,
    setIsAnalyzingAttachment: p.setIsAnalyzingAttachment,
    setUploadAnalysisProgress: p.setUploadAnalysisProgress,
    setAnalysisReport: p.setAnalysisReport,
    setShowAnalysisPanel: p.setShowAnalysisPanel,
    setChatMessages: p.setChatMessages,
    loadIterations: p.loadIterations,
    loadGovernance: p.loadGovernance
  };
}

function buildChatDeps(
  p: Pick<UseIterationActionsParams,
    "currentIteration" | "currentProjectId" | "currentRole" | "chatInput" |
    "analysisReport" | "uploadedFile" | "setChatInput" | "setChatSendStatus" |
    "setError" | "setChatMessages" | "setShowAnalysisPanel" |
    "loadIterationDetail" | "loadIterations" | "loadGovernance" |
    "fullCycleJob" | "setFullCycleJob">
): ChatActionDeps {
  return {
    currentIteration: p.currentIteration,
    currentProjectId: p.currentProjectId,
    currentRole: p.currentRole,
    chatInput: p.chatInput,
    analysisReport: p.analysisReport,
    uploadedFile: p.uploadedFile,
    setChatInput: p.setChatInput,
    setChatSendStatus: p.setChatSendStatus,
    setError: p.setError,
    setChatMessages: p.setChatMessages,
    setShowAnalysisPanel: p.setShowAnalysisPanel,
    fullCycleJob: p.fullCycleJob,
    setFullCycleJob: p.setFullCycleJob,
    loadIterationDetail: p.loadIterationDetail,
    loadIterations: p.loadIterations,
    loadGovernance: p.loadGovernance
  };
}

function buildAssessmentDeps(
  p: Pick<UseIterationActionsParams,
    "currentIteration" | "currentProjectId" | "setBusy" | "setError" |
    "loadIterationDetail" | "loadIterations" | "loadGovernance">
): AssessmentActionDeps {
  return {
    currentIteration: p.currentIteration,
    currentProjectId: p.currentProjectId,
    setBusy: p.setBusy,
    setError: p.setError,
    loadIterationDetail: p.loadIterationDetail,
    loadIterations: p.loadIterations,
    loadGovernance: p.loadGovernance
  };
}

function buildChangeControlDeps(
  p: Pick<UseIterationActionsParams,
    "currentIteration" | "currentProjectId" | "currentRole" | "analysisReport" |
    "setBusy" | "setError" | "setStateMachine" | "setChatMessages" |
    "loadIterationDetail" | "loadIterations" | "loadGovernance">
): ChangeControlActionDeps {
  return {
    currentIteration: p.currentIteration,
    currentProjectId: p.currentProjectId,
    currentRole: p.currentRole,
    analysisReport: p.analysisReport,
    setBusy: p.setBusy,
    setError: p.setError,
    setStateMachine: p.setStateMachine,
    setChatMessages: p.setChatMessages,
    loadIterationDetail: p.loadIterationDetail,
    loadIterations: p.loadIterations,
    loadGovernance: p.loadGovernance
  };
}

function buildQualityDeps(
  p: Pick<UseIterationActionsParams,
    "currentIteration" | "setBusy" | "setError" | "setAnalysisReport" |
    "setChatMessages" | "loadIterationDetail" | "loadGovernance">
): QualityActionDeps {
  return {
    currentIteration: p.currentIteration,
    setBusy: p.setBusy,
    setError: p.setError,
    setAnalysisReport: p.setAnalysisReport,
    setChatMessages: p.setChatMessages,
    loadIterationDetail: p.loadIterationDetail,
    loadGovernance: p.loadGovernance
  };
}

function buildArtifactDeps(
  p: Pick<UseIterationActionsParams,
    "currentIteration" | "currentProjectId" | "setBusy" | "setError" |
    "setChatMessages" | "loadIterationDetail" | "loadIterations">
): ArtifactActionDeps {
  return {
    currentIteration: p.currentIteration,
    currentProjectId: p.currentProjectId,
    setBusy: p.setBusy,
    setError: p.setError,
    setChatMessages: p.setChatMessages,
    loadIterationDetail: p.loadIterationDetail,
    loadIterations: p.loadIterations
  };
}

/* ── wrapper builder (module-level, no hooks) ───────────────────────── */

type AllDeps = {
  uploadDeps: UploadActionDeps;
  chatDeps: ChatActionDeps;
  assessmentDeps: AssessmentActionDeps;
  changeControlDeps: ChangeControlActionDeps;
  qualityDeps: QualityActionDeps;
  artifactDeps: ArtifactActionDeps;
};

type SendOptions = {
  overrideText?: string;
  prototypeTarget?: string | null;
  prototypeSummary?: string;
  interactionContext?: {
    mode?: "html" | "image" | "prototype";
    target?: string;
    summary?: string;
    html?: { selector?: string; tag?: string; text?: string; styles?: Record<string, string> };
  };
};

type ConfirmPayload = {
  accurate: boolean;
  note?: string;
  decisionEvent?: "understanding-accurate" | "understanding-inaccurate";
  resolvedClarificationQuestions?: string[];
  boundary?: { requirementRefs?: string[]; componentRefs?: string[]; codePaths?: string[]; note?: string };
};

type BoundaryPayload = { requirementRefs?: string[]; componentRefs?: string[]; note?: string };

type ArtifactStagePayload = {
  toStage: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive";
  actor?: string;
  note?: string;
};

function buildIterationActionWrappers(
  deps: AllDeps,
  currentIteration: Iteration | null,
  fileInputRef: RefObject<HTMLInputElement>
) {
  const { uploadDeps, chatDeps, assessmentDeps, changeControlDeps, qualityDeps, artifactDeps } = deps;

  return {
    handleUploadClick: () => handleUploadClickFn(currentIteration, fileInputRef),
    handleUpload: (event: ChangeEvent<HTMLInputElement>) => handleUploadFn(event, uploadDeps),
    uploadFiles: (files: File[]) => uploadFilesFn(files, uploadDeps),
    handleRetryUpload: () => handleRetryUploadFn(uploadDeps),
    handleSend: (options?: SendOptions): Promise<IterationVisualEditResponse | null> => handleSendFn(chatDeps, options),
    onCancelFullCycle: () => {
      const job = chatDeps.fullCycleJob;
      if (!job) return;
      void cancelFullCycleJob(job.iterationId, job.jobId).then((res) => {
        if (!res.ok) console.warn("[onCancelFullCycle] 取消请求未生效", res.reason);
      });
    },
    onRetryFullCycle: () => currentIteration ? handleResumeFullCycleFn(chatDeps, "", currentIteration.id) : null,
    handleRecomputeAssessment: () => handleRecomputeAssessmentFn(assessmentDeps),
    handleRestoreSnapshot: (snapshotId: number) => handleRestoreSnapshotFn(snapshotId, assessmentDeps),
    handleTransitionState: (toStatus: IterationStatus) => handleTransitionStateFn(toStatus, changeControlDeps),
    handleUpdateClarificationDraft: (resolvedQuestions: string[]) => handleUpdateClarificationDraftFn(resolvedQuestions, changeControlDeps),
    handleConfirmIterationAnalysis: (payload: ConfirmPayload) => handleConfirmIterationAnalysisFn(payload, changeControlDeps),
    handleUpdateIterationBoundary: (payload: BoundaryPayload) => handleUpdateIterationBoundaryFn(payload, changeControlDeps),
    handleUpdateTestMatrixExecution: (updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>) => handleUpdateTestMatrixExecutionFn(updates, qualityDeps),
    handleGenerateTestArtifacts: () => handleGenerateTestArtifactsFn(qualityDeps),
    handleRefreshReleaseReview: () => handleRefreshReleaseReviewFn(qualityDeps),
    handleSaveArtifactDraft: (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) => handleSaveArtifactDraftFn(artifactId, payload, artifactDeps),
    handleCommitArtifact: (artifactId: string, payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }) => handleCommitArtifactFn(artifactId, payload, artifactDeps),
    handleConfirmArtifact: (artifactId: string, payload: { actor?: string; passed?: boolean; note?: string }) => handleConfirmArtifactFn(artifactId, payload, artifactDeps),
    handleAppendArtifactToChat: (artifactId: string, payload?: { actor?: string; prompt?: string }) => handleAppendArtifactToChatFn(artifactId, artifactDeps, payload),
    handleTransitionArtifactStage: (payload: ArtifactStagePayload) => handleTransitionArtifactStageFn(payload, artifactDeps)
  };
}

/* ── the hook itself ────────────────────────────────────────────────── */

export function useIterationActions(params: UseIterationActionsParams) {
  const { currentIteration, fileInputRef } = params;

  const lastUploadAttemptRef = useRef<{ iterationId: number; files: File[] } | null>(null);
  const [lastUploadFailed, setLastUploadFailed] = useState(false);

  const uploadDeps = buildUploadDeps(params, setLastUploadFailed, lastUploadAttemptRef);
  const chatDeps = buildChatDeps(params);
  const assessmentDeps = buildAssessmentDeps(params);
  const changeControlDeps = buildChangeControlDeps(params);
  const qualityDeps = buildQualityDeps(params);
  const artifactDeps = buildArtifactDeps(params);

  const wrappers = buildIterationActionWrappers(
    { uploadDeps, chatDeps, assessmentDeps, changeControlDeps, qualityDeps, artifactDeps },
    currentIteration,
    fileInputRef
  );

  return { ...wrappers, lastUploadFailed, setLastUploadFailed };
}
