import { memo, type RefObject } from "react";
import type { AnalysisArtifactSection } from "./analysisArtifactPresenter";
import type {
  ArtifactPreviewKind,
  HtmlPreviewInteractionPayload,
  HtmlPreviewHistoryItem,
} from "./iterationWorkspacePanelTypes";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationVisualEditResponse,
} from "./iterationWorkspacePanelTypes";
import type { OpsTriageTemplate } from "./iterationWorkspacePanelTypes";
import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";
import type { UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import { ArtifactImpactPanel } from "./IterationChangeIntelligencePanel";
import { ArtifactPreviewPanel } from "./ArtifactPreviewPanel";
import { ArtifactReviewFooter } from "./ArtifactReviewFooter";
import { TestMatrixExecutionPanel } from "./TestMatrixExecutionPanel";
import { OpsTriageSection } from "./OpsTriageSection";
import { VersionDiffBox } from "./VersionDiffBox";
import { AnalysisReportSections } from "./AnalysisReportSections";

/* ────────────────────────────────────────────────────────── */

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
  openInteractionPanel: () => void;

  /* ── callbacks: ops templates ── */
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

export const AnalysisDrawerContent = memo(function AnalysisDrawerContent(props: AnalysisDrawerContentProps) {
  const {
    analysisReport,
    currentIteration,
    selectedDrawerArtifact,
    selectedArtifactKind,
    artifactEditorValue,
    artifactEditorDirty,
    artifactEditorBusy,
    artifactEditorMode,
    artifactEditorSource,
    isEditableTextArtifact: _isEditableTextArtifact,
    canEditSelectedTextArtifact,
    selectedArtifactAwaitingConfirmation,
    analysisDraftSections,
    artifactDraftContent,
    selectedArtifactHtmlPreview,
    selectedArtifactHtmlContent: _selectedArtifactHtmlContent,
    selectedHtmlPreview,
    selectedHtmlElement,
    interactionEditMode,
    htmlPreviewHistory,
    interactionInstruction,
    generatedTestMatrix,
    testMatrixStatusMap,
    testMatrixNoteMap,
    matrixSummary,
    onlyHighValue,
    visiblePrioritizedFindings,
    materialRisks,
    materialSuggestions,
    showAdvancedReportSections,
    hasBaselineComparison,
    traceabilityMap,
    executableConstraints,
    versionDiffDetailed,
    releaseReview,
    domainKnowledge,
    opsTriage,
    qualityArtifacts,
    diffLocations,
    diffAdded,
    diffChanged,
    diffRemoved,
    reportPendingConfirmation,
    reportConfirmedAt,
    confirmedUnderstanding,
    changeControlBusy,
    opsCopyNotice,
    templateBusy,
    templateNotice,
    templateCategory,
    templateKeywordsText,
    templateCommandsText,
    templateNote,
    opsTemplates,
    imagePrototypePreviews,
    artifactDrawerWidth,
    analysisScrollRef,
    artifactHtmlPreviewFrameRef,
    onCloseAnalysisPanel,
    onChatInputChange,
    onChatSend,
    handleSaveArtifactEditor,
    handleSubmitArtifactForReview,
    handleConfirmSelectedArtifact,
    handleRequestArtifactRevision,
    onUpdateTestMatrixExecution,
    onGenerateTestArtifacts,
    onRefreshReleaseReview,
    setArtifactEditorValue,
    setArtifactEditorDirty,
    setArtifactEditorMode,
    setChangeControlBusy,
    setChangeControlNotice,
    setOpsCopyNotice,
    setTestMatrixStatusMap,
    setTestMatrixNoteMap,
    setOnlyHighValue,
    setTemplateBusy,
    setTemplateNotice,
    setTemplateCategory,
    setTemplateKeywordsText,
    setTemplateCommandsText,
    setTemplateNote,
    setInteractionEditMode,
    setInteractionInstruction,
    handleArtifactDrawerResizePointerDown,
    handleUndoHtmlPreview,
    sendInteractionInstruction,
    openInteractionPanel,
    reloadOpsTemplates,
    buildOpsCommandTemplates,
  } = props;

  return (
    <>
      <div className="analysis-drawer-mask open" onClick={onCloseAnalysisPanel} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") onCloseAnalysisPanel(); }} aria-label="关闭" aria-hidden={false} />
      <aside
        className="panel preview-panel context-panel artifact-preview-panel analysis-drawer open"
        style={{ width: `min(${artifactDrawerWidth}px, 100vw)` }}
      >
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="artifact-drawer-resize-handle"
            aria-label="拖拽调整交付物抽屉宽度"
            title="拖拽调整交付物抽屉宽度"
            onPointerDown={handleArtifactDrawerResizePointerDown}
          />
          <div className="panel-head analysis-drawer-head">
            <div>
              <h2>{selectedDrawerArtifact ? `${selectedDrawerArtifact.title}` : "分析报告抽屉"}</h2>
            </div>
            <div className="chat-tools">
              <button type="button" className="visual-align-hidden-trigger" onClick={openInteractionPanel}>
                交互界面
              </button>
              <button type="button" className="icon-btn" aria-label="关闭报告抽屉" onClick={onCloseAnalysisPanel}>
                ✕
              </button>
            </div>
          </div>
          <div
            ref={analysisScrollRef}
            className="preview-scroll"
          >
            {selectedDrawerArtifact ? (
              <>
                <ArtifactPreviewPanel
                  selectedDrawerArtifact={selectedDrawerArtifact}
                  selectedArtifactKind={selectedArtifactKind}
                  artifactEditorValue={artifactEditorValue}
                  artifactEditorDirty={artifactEditorDirty}
                  artifactEditorBusy={artifactEditorBusy}
                  artifactEditorMode={artifactEditorMode}
                  artifactEditorSource={artifactEditorSource}
                  canEditSelectedTextArtifact={canEditSelectedTextArtifact}
                  analysisDraftSections={analysisDraftSections}
                  artifactDraftContent={artifactDraftContent}
                  selectedArtifactHtmlPreview={selectedArtifactHtmlPreview}
                  selectedHtmlPreview={selectedHtmlPreview}
                  selectedHtmlElement={selectedHtmlElement}
                  interactionEditMode={interactionEditMode}
                  htmlPreviewHistory={htmlPreviewHistory}
                  interactionInstruction={interactionInstruction}
                  analysisReport={analysisReport}
                  generatedTestMatrix={generatedTestMatrix}
                  currentIteration={currentIteration}
                  imagePrototypePreviews={imagePrototypePreviews}
                  artifactHtmlPreviewFrameRef={artifactHtmlPreviewFrameRef}
                  handleSaveArtifactEditor={handleSaveArtifactEditor}
                  handleSubmitArtifactForReview={handleSubmitArtifactForReview}
                  handleUndoHtmlPreview={handleUndoHtmlPreview}
                  sendInteractionInstruction={sendInteractionInstruction}
                  setArtifactEditorValue={setArtifactEditorValue}
                  setArtifactEditorDirty={setArtifactEditorDirty}
                  setArtifactEditorMode={setArtifactEditorMode}
                  setInteractionEditMode={setInteractionEditMode}
                  setInteractionInstruction={setInteractionInstruction}
                  setChangeControlNotice={setChangeControlNotice}
                />
                <ArtifactImpactPanel iteration={currentIteration} artifact={selectedDrawerArtifact} />
                <ArtifactReviewFooter
                  selectedDrawerArtifact={selectedDrawerArtifact}
                  selectedArtifactAwaitingConfirmation={selectedArtifactAwaitingConfirmation}
                  artifactEditorBusy={artifactEditorBusy}
                  handleConfirmSelectedArtifact={handleConfirmSelectedArtifact}
                  handleRequestArtifactRevision={handleRequestArtifactRevision}
                />
              </>
            ) : null}
            {!selectedDrawerArtifact ? (
              !analysisReport ? (
              <div className="analysis-fallback-shell">
                <section className="analysis-fallback-section">
                  <h3>对话推进模式</h3>
                  <div className="info-box">
                    <p>当前暂无结构化分析报告。请直接在聊天窗口继续描述目标、边界或阻断点，OpenClaw 会按对话上下文逐轮推进。</p>
                    <p className="hint">建议先上传最新需求/原型/代码变更材料，再继续对话以获得更准确推进结果。</p>
                  </div>
                </section>
              </div>
              ) : (
              <>
                <AnalysisReportSections
                  analysisReport={analysisReport}
                  currentIteration={currentIteration}
                  reportPendingConfirmation={reportPendingConfirmation}
                  reportConfirmedAt={reportConfirmedAt}
                  confirmedUnderstanding={confirmedUnderstanding}
                  onlyHighValue={onlyHighValue}
                  visiblePrioritizedFindings={visiblePrioritizedFindings}
                  materialRisks={materialRisks}
                  materialSuggestions={materialSuggestions}
                  showAdvancedReportSections={showAdvancedReportSections}
                  hasBaselineComparison={hasBaselineComparison}
                  traceabilityMap={traceabilityMap}
                  executableConstraints={executableConstraints}
                  versionDiffDetailed={versionDiffDetailed}
                  releaseReview={releaseReview}
                  domainKnowledge={domainKnowledge}
                  qualityArtifacts={qualityArtifacts}
                  setOnlyHighValue={setOnlyHighValue}
                  onChatInputChange={onChatInputChange}
                  onChatSend={onChatSend}
                />
                {showAdvancedReportSections && generatedTestMatrix.length > 0 ? (
                  <TestMatrixExecutionPanel
                    generatedTestMatrix={generatedTestMatrix}
                    testMatrixStatusMap={testMatrixStatusMap}
                    testMatrixNoteMap={testMatrixNoteMap}
                    matrixSummary={matrixSummary}
                    changeControlBusy={changeControlBusy}
                    setTestMatrixStatusMap={setTestMatrixStatusMap}
                    setTestMatrixNoteMap={setTestMatrixNoteMap}
                    setChangeControlBusy={setChangeControlBusy}
                    setChangeControlNotice={setChangeControlNotice}
                    onUpdateTestMatrixExecution={onUpdateTestMatrixExecution}
                    onGenerateTestArtifacts={onGenerateTestArtifacts}
                    onRefreshReleaseReview={onRefreshReleaseReview}
                  />
                ) : null}
                {showAdvancedReportSections && opsTriage ? (
                  <OpsTriageSection
                    opsTriage={opsTriage}
                    currentIterationProjectId={currentIteration?.projectId}
                    opsTemplates={opsTemplates}
                    templateBusy={templateBusy}
                    templateNotice={templateNotice}
                    templateCategory={templateCategory}
                    templateKeywordsText={templateKeywordsText}
                    templateCommandsText={templateCommandsText}
                    templateNote={templateNote}
                    opsCopyNotice={opsCopyNotice}
                    setTemplateBusy={setTemplateBusy}
                    setTemplateNotice={setTemplateNotice}
                    setTemplateCategory={setTemplateCategory}
                    setTemplateKeywordsText={setTemplateKeywordsText}
                    setTemplateCommandsText={setTemplateCommandsText}
                    setTemplateNote={setTemplateNote}
                    setOpsCopyNotice={setOpsCopyNotice}
                    reloadOpsTemplates={reloadOpsTemplates}
                    buildOpsCommandTemplates={buildOpsCommandTemplates}
                  />
                ) : null}
                <VersionDiffBox
                  hasBaselineComparison={hasBaselineComparison}
                  analysisReport={analysisReport}
                  diffLocations={diffLocations}
                  diffAdded={diffAdded}
                  diffChanged={diffChanged}
                  diffRemoved={diffRemoved}
                />
                {materialRisks.length > 0 ? (
                  <div className="info-box">
                    <h3>风险提示</h3>
                    <p>{materialRisks.join("；")}</p>
                  </div>
                ) : null}
                {materialSuggestions.length > 0 ? (
                  <div className="info-box">
                    <h3>建议动作</h3>
                    <p>{materialSuggestions.join("；")}</p>
                  </div>
                ) : null}
              </>
              )
            ) : null}
          </div>
            </article>
          </aside>
    </>
  );
});
