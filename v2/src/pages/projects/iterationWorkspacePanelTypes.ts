import type { ChangeEvent, RefObject } from "react";
import type {
  AttachmentAnalysisReport,
  ChatSendStatus,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationStatus,
  IterationMessage,
  IterationVisualEditResponse,
} from "../../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { OpsTriageTemplate } from "../../domain/workspace/platformTypes";
import type { IterationArtifactStage } from "../../domain/workspace/iterationTypes";
import type { FullCycleJobRef } from "../../contexts/ChatContext";

export type PrototypeElement = {
  id: string;
  page: string;
  component: string;
  label: string;
  background: string;
  color: string;
  visible: boolean;
  emphasized: boolean;
  width: number;
  height: number;
};

export type PrototypeChangeHistoryItem = {
  id: string;
  targetId: string;
  targetLabel: string;
  instruction: string;
  summary: string;
  before: PrototypeElement;
  after: PrototypeElement;
  at: string;
};

export type HtmlPreviewInteractionPayload = {
  selector: string;
  tag: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: {
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontWeight: string;
    borderRadius: string;
    padding: string;
    margin: string;
  };
};

export type ImageSelectionRegion = {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

export type HtmlPreviewHistoryItem = {
  path: string;
  artifactId?: string;
  content: string;
  selector: string;
  text: string;
  styles: Partial<Record<"color" | "backgroundColor" | "fontSize" | "fontWeight" | "width" | "height" | "display", string>>;
};

export type ArtifactPreviewKind =
  | "analysis-report"
  | "product-requirements-doc"
  | "design-spec"
  | "technical-architecture"
  | "document"
  | "html-prototype"
  | "code"
  | "test-cases"
  | "release-review"
  | "delivery-package";

export type IterationWorkspacePanelProps = {
  currentIteration: Iteration | null;
  error: string | null;
  contextData: IterationContextPayload | null;
  stateMachine: IterationStateMachinePayload | null;
  chatMessages: IterationMessage[];
  chatSendStatus: ChatSendStatus;
  fullCycleJob: FullCycleJobRef | null;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  uploadedFile: UploadedAttachmentMeta | null;
  analysisReport: AttachmentAnalysisReport | null;
  showAnalysisPanel: boolean;
  isAnalyzingAttachment: boolean;
  lastUploadFailed: boolean;
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  uploadToastMessage: string | null;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onClearUploadToast: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles: (files: File[]) => void | Promise<void>;
  onRetryUpload: () => void | Promise<void>;
  onChatInputChange: (value: string) => void;
  onCancelFullCycle: () => void;
  onRetryFullCycle: () => void;
  onChatSend: (options?: {
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
  }) => Promise<IterationVisualEditResponse | null>;
  onUpdateClarificationDraft: (resolvedQuestions: string[]) => void | Promise<void>;
  onConfirmIterationAnalysis: (payload: {
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
  }) => void | Promise<void>;
  onUpdateIterationBoundary: (payload: {
    requirementRefs?: string[];
    componentRefs?: string[];
    codePaths?: string[];
    note?: string;
  }) => void | Promise<void>;
  onUpdateTestMatrixExecution: (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => void | Promise<void>;
  onGenerateTestArtifacts: (dryRun?: boolean) => void | Promise<void>;
  onRefreshReleaseReview: () => void | Promise<void>;
  onSaveArtifactDraft: (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) => void | Promise<void>;
  onCommitArtifact: (
    artifactId: string,
    payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }
  ) => void | Promise<void>;
  onConfirmArtifact: (artifactId: string, payload: { actor?: string; passed?: boolean; note?: string }) => void | Promise<void>;
  onTransitionArtifactStage: (payload: { toStage: IterationArtifactStage; actor?: string; note?: string }) => void | Promise<void>;
  onTransitionState: (toStatus: IterationStatus) => void;
  onSwitchToProjectPanel: () => void;
  onAppendArtifactToChat: (artifactId: string, payload?: { actor?: string; prompt?: string }) => void | Promise<void>;
  onPatchUploadedHtmlPreview?: (path: string, content: string) => void;
};

export type { AttachmentAnalysisReport, ChatSendStatus, Iteration, IterationContextPayload, IterationStateMachinePayload, IterationStatus, IterationMessage, IterationVisualEditResponse };
export type { UploadAnalysisProgress, UploadedAttachmentMeta };
export type { OpsTriageTemplate };
export type { IterationArtifactStage };
