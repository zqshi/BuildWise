import { memo, type RefObject } from "react";
import type { AnalysisArtifactSection } from "./analysisArtifactPresenter";
import type {
  ArtifactPreviewKind,
  HtmlPreviewInteractionPayload,
  HtmlPreviewHistoryItem,
  AttachmentAnalysisReport,
  Iteration,
  OpsTriageTemplate,
} from "./iterationWorkspacePanelTypes";
import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import type { UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { CoachGuidanceItem } from "../../app/coachGuidanceBuilder";
import { ArtifactImpactPanel } from "./IterationChangeIntelligencePanel";
import { ArtifactPreviewPanel } from "./ArtifactPreviewPanel";
import { ArtifactReviewFooter } from "./ArtifactReviewFooter";
import { TestMatrixExecutionPanel } from "./TestMatrixExecutionPanel";
import { OpsTriageSection } from "./OpsTriageSection";
import { VersionDiffBox } from "./VersionDiffBox";
import { AnalysisReportSections } from "./AnalysisReportSections";

/* ── DrawerMask ── */

export type DrawerMaskProps = {
  onClose: () => void;
};

export const DrawerMask = memo(function DrawerMask({ onClose }: DrawerMaskProps) {
  return (
    <div
      className="analysis-drawer-mask open"
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      aria-label="关闭"
      aria-hidden={false}
    />
  );
});

/* ── DrawerHeader ── */

export type DrawerHeaderProps = {
  title: string;
  showInteractionEntry: boolean;
  openInteractionPanel: () => void;
  onClose: () => void;
};

export const DrawerHeader = memo(function DrawerHeader(props: DrawerHeaderProps) {
  const { title, showInteractionEntry, openInteractionPanel, onClose } = props;
  return (
    <div className="panel-head analysis-drawer-head">
      <div>
        <h2>{title}</h2>
      </div>
      <div className="chat-tools">
        {showInteractionEntry ? (
          <button type="button" className="visual-align-hidden-trigger" onClick={openInteractionPanel}>
            交互界面
          </button>
        ) : null}
        <button type="button" className="icon-btn" aria-label="关闭报告抽屉" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
});

/* ── ArtifactSection ── */

export type ArtifactSectionProps = {
  selectedDrawerArtifact: IterationArtifactWorkflowItem;
  selectedArtifactKind: ArtifactPreviewKind | null;
  artifactEditorValue: string;
  artifactEditorDirty: boolean;
  artifactEditorBusy: boolean;
  artifactEditorMode: "view" | "edit";
  artifactEditorSource: string;
  canEditSelectedTextArtifact: boolean;
  selectedArtifactAwaitingConfirmation: boolean;
  analysisDraftSections: AnalysisArtifactSection[];
  artifactDraftContent: string;
  selectedArtifactHtmlPreview: string;
  selectedHtmlPreview: UploadedAttachmentMeta["htmlPreviews"][number] | null;
  selectedHtmlElement: HtmlPreviewInteractionPayload | null;
  interactionEditMode: boolean;
  htmlPreviewHistory: HtmlPreviewHistoryItem[];
  interactionInstruction: string;
  analysisReport: AttachmentAnalysisReport | null;
  generatedTestMatrix: IterationGeneratedTestCase[];
  currentIteration: Iteration | null;
  imagePrototypePreviews: UploadedAttachmentMeta["imagePreviews"];
  coachGuidance: CoachGuidanceItem[];
  artifactHtmlPreviewFrameRef: RefObject<HTMLIFrameElement>;
  handleSaveArtifactEditor: () => Promise<void>;
  handleSubmitArtifactForReview: () => Promise<void>;
  handleConfirmSelectedArtifact: () => Promise<void>;
  handleRequestArtifactRevision: () => void;
  handleUndoHtmlPreview: () => void;
  sendInteractionInstruction: (instruction: string) => Promise<void> | void;
  setArtifactEditorValue: React.Dispatch<React.SetStateAction<string>>;
  setArtifactEditorDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setArtifactEditorMode: React.Dispatch<React.SetStateAction<"view" | "edit">>;
  setInteractionEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  setInteractionInstruction: React.Dispatch<React.SetStateAction<string>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
};

export const ArtifactSection = memo(function ArtifactSection(props: ArtifactSectionProps) {
  return (
    <>
      <ArtifactPreviewPanel
        selectedDrawerArtifact={props.selectedDrawerArtifact}
        selectedArtifactKind={props.selectedArtifactKind}
        artifactEditorValue={props.artifactEditorValue}
        artifactEditorDirty={props.artifactEditorDirty}
        artifactEditorBusy={props.artifactEditorBusy}
        artifactEditorMode={props.artifactEditorMode}
        artifactEditorSource={props.artifactEditorSource}
        canEditSelectedTextArtifact={props.canEditSelectedTextArtifact}
        analysisDraftSections={props.analysisDraftSections}
        artifactDraftContent={props.artifactDraftContent}
        selectedArtifactHtmlPreview={props.selectedArtifactHtmlPreview}
        selectedHtmlPreview={props.selectedHtmlPreview}
        selectedHtmlElement={props.selectedHtmlElement}
        interactionEditMode={props.interactionEditMode}
        htmlPreviewHistory={props.htmlPreviewHistory}
        interactionInstruction={props.interactionInstruction}
        analysisReport={props.analysisReport}
        generatedTestMatrix={props.generatedTestMatrix}
        currentIteration={props.currentIteration}
        imagePrototypePreviews={props.imagePrototypePreviews}
        coachGuidance={props.coachGuidance}
        artifactHtmlPreviewFrameRef={props.artifactHtmlPreviewFrameRef}
        handleSaveArtifactEditor={props.handleSaveArtifactEditor}
        handleSubmitArtifactForReview={props.handleSubmitArtifactForReview}
        handleUndoHtmlPreview={props.handleUndoHtmlPreview}
        sendInteractionInstruction={props.sendInteractionInstruction}
        setArtifactEditorValue={props.setArtifactEditorValue}
        setArtifactEditorDirty={props.setArtifactEditorDirty}
        setArtifactEditorMode={props.setArtifactEditorMode}
        setInteractionEditMode={props.setInteractionEditMode}
        setInteractionInstruction={props.setInteractionInstruction}
        setChangeControlNotice={props.setChangeControlNotice}
      />
      <ArtifactImpactPanel
        iteration={props.currentIteration}
        artifact={props.selectedDrawerArtifact}
      />
      <ArtifactReviewFooter
        selectedDrawerArtifact={props.selectedDrawerArtifact}
        selectedArtifactAwaitingConfirmation={props.selectedArtifactAwaitingConfirmation}
        artifactEditorBusy={props.artifactEditorBusy}
        handleConfirmSelectedArtifact={props.handleConfirmSelectedArtifact}
        handleRequestArtifactRevision={props.handleRequestArtifactRevision}
      />
    </>
  );
});

/* ── ReportFallback ── */

export const ReportFallback = memo(function ReportFallback() {
  return (
    <div className="analysis-fallback-shell">
      <section className="analysis-fallback-section">
        <h3>对话推进模式</h3>
        <div className="info-box">
          <p>当前暂无结构化分析报告。请直接在聊天窗口继续描述目标、边界或阻断点，业务助手会按对话上下文逐轮推进。</p>
          <p className="hint">建议先上传最新需求/原型/代码变更材料，再继续对话以获得更准确推进结果。</p>
        </div>
      </section>
    </div>
  );
});

/* ── ReportSection ── */

export type ReportSectionProps = {
  analysisReport: AttachmentAnalysisReport;
  currentIteration: Iteration | null;
  reportPendingConfirmation: boolean;
  reportConfirmedAt: string;
  confirmedUnderstanding: string;
  onlyHighValue: boolean;
  visiblePrioritizedFindings: Array<{ priority: string; content: string; reason: string }>;
  businessConfirmation: AttachmentAnalysisReport["businessConfirmation"] | null;
  coachGuidance: CoachGuidanceItem[];
  materialRisks: string[];
  materialSuggestions: string[];
  showAdvancedReportSections: boolean;
  hasBaselineComparison: boolean;
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"] | undefined;
  executableConstraints: AttachmentAnalysisReport["executableConstraints"] | undefined;
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"] | undefined;
  releaseReview: AttachmentAnalysisReport["releaseReview"] | undefined;
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"] | undefined;
  opsTriage: AttachmentAnalysisReport["opsTriage"] | undefined;
  qualityArtifacts: AttachmentAnalysisReport["qualityArtifacts"] | undefined;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  diffAdded: string[];
  diffChanged: string[];
  diffRemoved: string[];
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
    perPlatform: Array<{ platform: string; summary: { total: number; executed: number; passed: number; failed: number; blocked: number; skipped: number; coverage: number; passRate: number } }>;
  };
  changeControlBusy: boolean;
  opsCopyNotice: string;
  templateBusy: boolean;
  templateNotice: string;
  templateCategory: string;
  templateKeywordsText: string;
  templateCommandsText: string;
  templateNote: string;
  opsTemplates: OpsTriageTemplate[];
  setOnlyHighValue: React.Dispatch<React.SetStateAction<boolean>>;
  setTestMatrixStatusMap: React.Dispatch<React.SetStateAction<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>>;
  setTestMatrixNoteMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setChangeControlBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
  setOpsCopyNotice: React.Dispatch<React.SetStateAction<string>>;
  setTemplateBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateNotice: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCategory: React.Dispatch<React.SetStateAction<string>>;
  setTemplateKeywordsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCommandsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateNote: React.Dispatch<React.SetStateAction<string>>;
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
  }) => Promise<unknown>;
  onUpdateTestMatrixExecution: (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => void | Promise<void>;
  onGenerateTestArtifacts: (dryRun?: boolean) => void | Promise<void>;
  onRefreshReleaseReview: () => void | Promise<void>;
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

export const ReportSection = memo(function ReportSection(props: ReportSectionProps) {
  return (
    <>
      <ReportAnalysisBlock {...pickAnalysisBlockProps(props)} />
      <ReportTestMatrixBlock {...pickTestMatrixBlockProps(props)} />
      <ReportOpsTriageBlock {...pickOpsTriageBlockProps(props)} />
      <VersionDiffBox
        hasBaselineComparison={props.hasBaselineComparison}
        analysisReport={props.analysisReport}
        diffLocations={props.diffLocations}
        diffAdded={props.diffAdded}
        diffChanged={props.diffChanged}
        diffRemoved={props.diffRemoved}
      />
      <ReportRiskSuggestionBlock
        materialRisks={props.materialRisks}
        materialSuggestions={props.materialSuggestions}
      />
    </>
  );
});

function pickAnalysisBlockProps(p: ReportSectionProps): ReportAnalysisBlockProps {
  return {
    analysisReport: p.analysisReport,
    currentIteration: p.currentIteration,
    reportPendingConfirmation: p.reportPendingConfirmation,
    reportConfirmedAt: p.reportConfirmedAt,
    confirmedUnderstanding: p.confirmedUnderstanding,
    onlyHighValue: p.onlyHighValue,
    visiblePrioritizedFindings: p.visiblePrioritizedFindings,
    businessConfirmation: p.businessConfirmation,
    coachGuidance: p.coachGuidance,
    materialRisks: p.materialRisks,
    materialSuggestions: p.materialSuggestions,
    showAdvancedReportSections: p.showAdvancedReportSections,
    hasBaselineComparison: p.hasBaselineComparison,
    traceabilityMap: p.traceabilityMap,
    executableConstraints: p.executableConstraints,
    versionDiffDetailed: p.versionDiffDetailed,
    releaseReview: p.releaseReview,
    domainKnowledge: p.domainKnowledge,
    qualityArtifacts: p.qualityArtifacts,
    setOnlyHighValue: p.setOnlyHighValue,
    onChatInputChange: p.onChatInputChange,
    onChatSend: p.onChatSend,
  };
}

function pickTestMatrixBlockProps(p: ReportSectionProps): ReportTestMatrixBlockProps {
  return {
    show: p.showAdvancedReportSections && p.generatedTestMatrix.length > 0,
    generatedTestMatrix: p.generatedTestMatrix,
    testMatrixStatusMap: p.testMatrixStatusMap,
    testMatrixNoteMap: p.testMatrixNoteMap,
    matrixSummary: p.matrixSummary,
    changeControlBusy: p.changeControlBusy,
    setTestMatrixStatusMap: p.setTestMatrixStatusMap,
    setTestMatrixNoteMap: p.setTestMatrixNoteMap,
    setChangeControlBusy: p.setChangeControlBusy,
    setChangeControlNotice: p.setChangeControlNotice,
    onUpdateTestMatrixExecution: p.onUpdateTestMatrixExecution,
    onGenerateTestArtifacts: p.onGenerateTestArtifacts,
    onRefreshReleaseReview: p.onRefreshReleaseReview,
  };
}

function pickOpsTriageBlockProps(p: ReportSectionProps): ReportOpsTriageBlockProps {
  return {
    show: p.showAdvancedReportSections && !!p.opsTriage,
    opsTriage: p.opsTriage,
    currentIterationProjectId: p.currentIteration?.projectId,
    opsTemplates: p.opsTemplates,
    templateBusy: p.templateBusy,
    templateNotice: p.templateNotice,
    templateCategory: p.templateCategory,
    templateKeywordsText: p.templateKeywordsText,
    templateCommandsText: p.templateCommandsText,
    templateNote: p.templateNote,
    opsCopyNotice: p.opsCopyNotice,
    setTemplateBusy: p.setTemplateBusy,
    setTemplateNotice: p.setTemplateNotice,
    setTemplateCategory: p.setTemplateCategory,
    setTemplateKeywordsText: p.setTemplateKeywordsText,
    setTemplateCommandsText: p.setTemplateCommandsText,
    setTemplateNote: p.setTemplateNote,
    setOpsCopyNotice: p.setOpsCopyNotice,
    reloadOpsTemplates: p.reloadOpsTemplates,
    buildOpsCommandTemplates: p.buildOpsCommandTemplates,
  };
}

/* ── ReportAnalysisBlock ── */

type ReportAnalysisBlockProps = {
  analysisReport: AttachmentAnalysisReport;
  currentIteration: Iteration | null;
  reportPendingConfirmation: boolean;
  reportConfirmedAt: string;
  confirmedUnderstanding: string;
  onlyHighValue: boolean;
  visiblePrioritizedFindings: Array<{ priority: string; content: string; reason: string }>;
  businessConfirmation: AttachmentAnalysisReport["businessConfirmation"] | null;
  coachGuidance: CoachGuidanceItem[];
  materialRisks: string[];
  materialSuggestions: string[];
  showAdvancedReportSections: boolean;
  hasBaselineComparison: boolean;
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"] | undefined;
  executableConstraints: AttachmentAnalysisReport["executableConstraints"] | undefined;
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"] | undefined;
  releaseReview: AttachmentAnalysisReport["releaseReview"] | undefined;
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"] | undefined;
  qualityArtifacts: AttachmentAnalysisReport["qualityArtifacts"] | undefined;
  setOnlyHighValue: React.Dispatch<React.SetStateAction<boolean>>;
  onChatInputChange: (value: string) => void;
  onChatSend: ReportSectionProps["onChatSend"];
};

const ReportAnalysisBlock = memo(function ReportAnalysisBlock(props: ReportAnalysisBlockProps) {
  return (
    <AnalysisReportSections
      analysisReport={props.analysisReport}
      currentIteration={props.currentIteration}
      reportPendingConfirmation={props.reportPendingConfirmation}
      reportConfirmedAt={props.reportConfirmedAt}
      confirmedUnderstanding={props.confirmedUnderstanding}
      onlyHighValue={props.onlyHighValue}
      visiblePrioritizedFindings={props.visiblePrioritizedFindings}
      businessConfirmation={props.businessConfirmation}
      coachGuidance={props.coachGuidance}
      materialRisks={props.materialRisks}
      materialSuggestions={props.materialSuggestions}
      showAdvancedReportSections={props.showAdvancedReportSections}
      hasBaselineComparison={props.hasBaselineComparison}
      traceabilityMap={props.traceabilityMap}
      executableConstraints={props.executableConstraints}
      versionDiffDetailed={props.versionDiffDetailed}
      releaseReview={props.releaseReview}
      domainKnowledge={props.domainKnowledge}
      qualityArtifacts={props.qualityArtifacts}
      setOnlyHighValue={props.setOnlyHighValue}
      onChatInputChange={props.onChatInputChange}
      onChatSend={props.onChatSend}
    />
  );
});

/* ── ReportTestMatrixBlock ── */

type ReportTestMatrixBlockProps = {
  show: boolean;
  generatedTestMatrix: IterationGeneratedTestCase[];
  testMatrixStatusMap: Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">;
  testMatrixNoteMap: Record<string, string>;
  matrixSummary: ReportSectionProps["matrixSummary"];
  changeControlBusy: boolean;
  setTestMatrixStatusMap: React.Dispatch<React.SetStateAction<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>>;
  setTestMatrixNoteMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setChangeControlBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
  onUpdateTestMatrixExecution: ReportSectionProps["onUpdateTestMatrixExecution"];
  onGenerateTestArtifacts: ReportSectionProps["onGenerateTestArtifacts"];
  onRefreshReleaseReview: ReportSectionProps["onRefreshReleaseReview"];
};

const ReportTestMatrixBlock = memo(function ReportTestMatrixBlock(props: ReportTestMatrixBlockProps) {
  if (!props.show) return null;
  return (
    <TestMatrixExecutionPanel
      generatedTestMatrix={props.generatedTestMatrix}
      testMatrixStatusMap={props.testMatrixStatusMap}
      testMatrixNoteMap={props.testMatrixNoteMap}
      matrixSummary={props.matrixSummary}
      changeControlBusy={props.changeControlBusy}
      setTestMatrixStatusMap={props.setTestMatrixStatusMap}
      setTestMatrixNoteMap={props.setTestMatrixNoteMap}
      setChangeControlBusy={props.setChangeControlBusy}
      setChangeControlNotice={props.setChangeControlNotice}
      onUpdateTestMatrixExecution={props.onUpdateTestMatrixExecution}
      onGenerateTestArtifacts={props.onGenerateTestArtifacts}
      onRefreshReleaseReview={props.onRefreshReleaseReview}
    />
  );
});

/* ── ReportOpsTriageBlock ── */

type ReportOpsTriageBlockProps = {
  show: boolean;
  opsTriage: AttachmentAnalysisReport["opsTriage"] | undefined;
  currentIterationProjectId: number | undefined;
  opsTemplates: OpsTriageTemplate[];
  templateBusy: boolean;
  templateNotice: string;
  templateCategory: string;
  templateKeywordsText: string;
  templateCommandsText: string;
  templateNote: string;
  opsCopyNotice: string;
  setTemplateBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateNotice: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCategory: React.Dispatch<React.SetStateAction<string>>;
  setTemplateKeywordsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCommandsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateNote: React.Dispatch<React.SetStateAction<string>>;
  setOpsCopyNotice: React.Dispatch<React.SetStateAction<string>>;
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

const ReportOpsTriageBlock = memo(function ReportOpsTriageBlock(props: ReportOpsTriageBlockProps) {
  if (!props.show || !props.opsTriage) return null;
  return (
    <OpsTriageSection
      opsTriage={props.opsTriage}
      currentIterationProjectId={props.currentIterationProjectId}
      opsTemplates={props.opsTemplates}
      templateBusy={props.templateBusy}
      templateNotice={props.templateNotice}
      templateCategory={props.templateCategory}
      templateKeywordsText={props.templateKeywordsText}
      templateCommandsText={props.templateCommandsText}
      templateNote={props.templateNote}
      opsCopyNotice={props.opsCopyNotice}
      setTemplateBusy={props.setTemplateBusy}
      setTemplateNotice={props.setTemplateNotice}
      setTemplateCategory={props.setTemplateCategory}
      setTemplateKeywordsText={props.setTemplateKeywordsText}
      setTemplateCommandsText={props.setTemplateCommandsText}
      setTemplateNote={props.setTemplateNote}
      setOpsCopyNotice={props.setOpsCopyNotice}
      reloadOpsTemplates={props.reloadOpsTemplates}
      buildOpsCommandTemplates={props.buildOpsCommandTemplates}
    />
  );
});

/* ── ReportRiskSuggestionBlock ── */

type ReportRiskSuggestionBlockProps = {
  materialRisks: string[];
  materialSuggestions: string[];
};

const ReportRiskSuggestionBlock = memo(function ReportRiskSuggestionBlock(props: ReportRiskSuggestionBlockProps) {
  return (
    <>
      {props.materialRisks.length > 0 ? (
        <div className="info-box">
          <h3>风险提示</h3>
          <p>{props.materialRisks.join("；")}</p>
        </div>
      ) : null}
      {props.materialSuggestions.length > 0 ? (
        <div className="info-box">
          <h3>建议动作</h3>
          <p>{props.materialSuggestions.join("；")}</p>
        </div>
      ) : null}
    </>
  );
});
