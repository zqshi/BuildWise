import type { RefObject } from "react";
import type { AnalysisArtifactSection } from "./analysisArtifactPresenter";
import type {
  ArtifactPreviewKind,
  HtmlPreviewInteractionPayload,
  HtmlPreviewHistoryItem,
  AttachmentAnalysisReport,
  Iteration,
  IterationVisualEditResponse,
  OpsTriageTemplate,
} from "./iterationWorkspacePanelTypes";
import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import type { UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { CoachGuidanceItem } from "../../app/coachGuidanceBuilder";

export type AnalysisDrawerContentProps = {
  /* ── core data ── */
  analysisReport: AttachmentAnalysisReport | null;
  currentIteration: Iteration | null;
  selectedDrawerArtifact: IterationArtifactWorkflowItem | null;
  selectedArtifactKind: ArtifactPreviewKind | null;

  /* ── artifact editor state ── */
  artifactEditorValue: string;
  artifactEditorDirty: boolean;
  artifactEditorBusy: boolean;
  artifactEditorMode: "view" | "edit";
  artifactEditorSource: string;
  isEditableTextArtifact: boolean;
  canEditSelectedTextArtifact: boolean;
  selectedArtifactAwaitingConfirmation: boolean;

  /* ── artifact draft / preview ── */
  analysisDraftSections: AnalysisArtifactSection[];
  artifactDraftContent: string;
  selectedArtifactHtmlPreview: string;
  selectedArtifactHtmlContent: string;

  /* ── html interaction ── */
  selectedHtmlPreview: UploadedAttachmentMeta["htmlPreviews"][number] | null;
  selectedHtmlElement: HtmlPreviewInteractionPayload | null;
  interactionEditMode: boolean;
  htmlPreviewHistory: HtmlPreviewHistoryItem[];
  interactionInstruction: string;

  /* ── test matrix ── */
  generatedTestMatrix: IterationGeneratedTestCase[];
  testMatrixStatusMap: Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">;
  testMatrixNoteMap: Record<string, string>;
  matrixSummary: {
    total: number;
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    coverage: number;
    passRate: number;
  };

  /* ── prioritised findings ── */
  onlyHighValue: boolean;
  visiblePrioritizedFindings: Array<{ priority: string; content: string; reason: string }>;

  /* ── coach guidance + business confirmation ── */
  coachGuidance: CoachGuidanceItem[];
  businessConfirmation: AttachmentAnalysisReport["businessConfirmation"] | null;

  /* ── risk / suggestions ── */
  materialRisks: string[];
  materialSuggestions: string[];

  /* ── report-level flags / derived ── */
  showAdvancedReportSections: boolean;
  hasBaselineComparison: boolean;

  /* ── advanced report sections ── */
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"] | undefined;
  executableConstraints: AttachmentAnalysisReport["executableConstraints"] | undefined;
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"] | undefined;
  releaseReview: AttachmentAnalysisReport["releaseReview"] | undefined;
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"] | undefined;
  opsTriage: AttachmentAnalysisReport["opsTriage"] | undefined;
  qualityArtifacts: AttachmentAnalysisReport["qualityArtifacts"] | undefined;

  /* ── diff data ── */
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  diffAdded: string[];
  diffChanged: string[];
  diffRemoved: string[];

  /* ── confirmation ── */
  reportPendingConfirmation: boolean;
  reportConfirmedAt: string;
  confirmedUnderstanding: string;

  /* ── clarification ── */
  clarificationQuestions: string[];

  /* ── change control / notices ── */
  changeControlBusy: boolean;
  changeControlNotice: string;
  opsCopyNotice: string;

  /* ── ops template form ── */
  templateBusy: boolean;
  templateNotice: string;
  templateCategory: string;
  templateKeywordsText: string;
  templateCommandsText: string;
  templateNote: string;

  /* ── ops templates data ── */
  opsTemplates: OpsTriageTemplate[];

  /* ── image previews (used for hint) ── */
  imagePrototypePreviews: UploadedAttachmentMeta["imagePreviews"];

  /* ── layout ── */
  artifactDrawerWidth: number;

  /* ── refs ── */
  analysisScrollRef: RefObject<HTMLDivElement>;
  artifactHtmlPreviewFrameRef: RefObject<HTMLIFrameElement>;

  /* ── callbacks: panel actions ── */
  onCloseAnalysisPanel: () => void;
  onChatInputChange: (value: string) => void;
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

  /* ── callbacks: artifact actions ── */
  handleSaveArtifactEditor: () => Promise<void>;
  handleSubmitArtifactForReview: () => Promise<void>;
  handleConfirmSelectedArtifact: () => Promise<void>;
  handleRequestArtifactRevision: () => void;

  /* ── callbacks: test matrix ── */
  onUpdateTestMatrixExecution: (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => void | Promise<void>;
  onGenerateTestArtifacts: (dryRun?: boolean) => void | Promise<void>;
  onRefreshReleaseReview: () => void | Promise<void>;

  /* ── callbacks: setters ── */
  setArtifactEditorValue: React.Dispatch<React.SetStateAction<string>>;
  setArtifactEditorDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setArtifactEditorMode: React.Dispatch<React.SetStateAction<"view" | "edit">>;
  setArtifactEditorBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
  setOpsCopyNotice: React.Dispatch<React.SetStateAction<string>>;
  setTestMatrixStatusMap: React.Dispatch<React.SetStateAction<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>>;
  setTestMatrixNoteMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setOnlyHighValue: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateNotice: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCategory: React.Dispatch<React.SetStateAction<string>>;
  setTemplateKeywordsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCommandsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateNote: React.Dispatch<React.SetStateAction<string>>;
  setInteractionEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInteractionInstruction: React.Dispatch<React.SetStateAction<string>>;
  setSelectedHtmlElement: React.Dispatch<React.SetStateAction<HtmlPreviewInteractionPayload | null>>;
  setHoveredHtmlElement: React.Dispatch<React.SetStateAction<HtmlPreviewInteractionPayload | null>>;
  setHtmlPreviewHistory: React.Dispatch<React.SetStateAction<HtmlPreviewHistoryItem[]>>;

  /* ── callbacks: drawer resize ── */
  handleArtifactDrawerResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;

  /* ── callbacks: html preview ── */
  handleUndoHtmlPreview: () => void;
  sendInteractionInstruction: (instruction: string) => Promise<void> | void;

  /* ── callbacks: interaction panel ── */
  showInteractionEntry: boolean;
  openInteractionPanel: () => void;

  /* ── callbacks: ops templates ── */
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};
