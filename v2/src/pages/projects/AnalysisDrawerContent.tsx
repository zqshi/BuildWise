import { memo } from "react";
import type { AnalysisDrawerContentProps } from "./analysisDrawerContentTypes";
import {
  DrawerMask,
  DrawerHeader,
  ArtifactSection,
  ReportFallback,
  ReportSection,
} from "./AnalysisDrawerPanels";

export type { AnalysisDrawerContentProps } from "./analysisDrawerContentTypes";

/* ── thin orchestrator ── */

export const AnalysisDrawerContent = memo(function AnalysisDrawerContent(props: AnalysisDrawerContentProps) {
  const { selectedDrawerArtifact, analysisReport, artifactDrawerWidth, analysisScrollRef } = props;

  const title = selectedDrawerArtifact ? selectedDrawerArtifact.title : "分析报告抽屉";

  return (
    <>
      <DrawerMask onClose={props.onCloseAnalysisPanel} />
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
            onPointerDown={props.handleArtifactDrawerResizePointerDown}
          />
          <DrawerHeader
            title={title}
            showInteractionEntry={props.showInteractionEntry}
            openInteractionPanel={props.openInteractionPanel}
            onClose={props.onCloseAnalysisPanel}
          />
          <div ref={analysisScrollRef} className="preview-scroll">
            {selectedDrawerArtifact ? <ArtifactSection {...pickArtifactProps(props)} /> : null}
            {!selectedDrawerArtifact ? (
              !analysisReport ? <ReportFallback /> : <ReportSection {...pickReportProps(props)} />
            ) : null}
          </div>
        </article>
      </aside>
    </>
  );
});

/* ── prop pickers (pure mapping, no logic) ── */

function pickArtifactProps(p: AnalysisDrawerContentProps) {
  return {
    selectedDrawerArtifact: p.selectedDrawerArtifact!,
    selectedArtifactKind: p.selectedArtifactKind,
    artifactEditorValue: p.artifactEditorValue,
    artifactEditorDirty: p.artifactEditorDirty,
    artifactEditorBusy: p.artifactEditorBusy,
    artifactEditorMode: p.artifactEditorMode,
    artifactEditorSource: p.artifactEditorSource,
    canEditSelectedTextArtifact: p.canEditSelectedTextArtifact,
    selectedArtifactAwaitingConfirmation: p.selectedArtifactAwaitingConfirmation,
    analysisDraftSections: p.analysisDraftSections,
    artifactDraftContent: p.artifactDraftContent,
    selectedArtifactHtmlPreview: p.selectedArtifactHtmlPreview,
    selectedHtmlPreview: p.selectedHtmlPreview,
    selectedHtmlElement: p.selectedHtmlElement,
    interactionEditMode: p.interactionEditMode,
    htmlPreviewHistory: p.htmlPreviewHistory,
    interactionInstruction: p.interactionInstruction,
    analysisReport: p.analysisReport,
    generatedTestMatrix: p.generatedTestMatrix,
    currentIteration: p.currentIteration,
    imagePrototypePreviews: p.imagePrototypePreviews,
    coachGuidance: p.coachGuidance,
    artifactHtmlPreviewFrameRef: p.artifactHtmlPreviewFrameRef,
    handleSaveArtifactEditor: p.handleSaveArtifactEditor,
    handleSubmitArtifactForReview: p.handleSubmitArtifactForReview,
    handleConfirmSelectedArtifact: p.handleConfirmSelectedArtifact,
    handleRequestArtifactRevision: p.handleRequestArtifactRevision,
    handleUndoHtmlPreview: p.handleUndoHtmlPreview,
    sendInteractionInstruction: p.sendInteractionInstruction,
    setArtifactEditorValue: p.setArtifactEditorValue,
    setArtifactEditorDirty: p.setArtifactEditorDirty,
    setArtifactEditorMode: p.setArtifactEditorMode,
    setInteractionEditMode: p.setInteractionEditMode,
    setInteractionInstruction: p.setInteractionInstruction,
    setChangeControlNotice: p.setChangeControlNotice,
  } as const;
}

function pickReportProps(p: AnalysisDrawerContentProps) {
  return {
    analysisReport: p.analysisReport!,
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
    opsTriage: p.opsTriage,
    qualityArtifacts: p.qualityArtifacts,
    diffLocations: p.diffLocations,
    diffAdded: p.diffAdded,
    diffChanged: p.diffChanged,
    diffRemoved: p.diffRemoved,
    generatedTestMatrix: p.generatedTestMatrix,
    testMatrixStatusMap: p.testMatrixStatusMap,
    testMatrixNoteMap: p.testMatrixNoteMap,
    matrixSummary: p.matrixSummary,
    changeControlBusy: p.changeControlBusy,
    opsCopyNotice: p.opsCopyNotice,
    templateBusy: p.templateBusy,
    templateNotice: p.templateNotice,
    templateCategory: p.templateCategory,
    templateKeywordsText: p.templateKeywordsText,
    templateCommandsText: p.templateCommandsText,
    templateNote: p.templateNote,
    opsTemplates: p.opsTemplates,
    setOnlyHighValue: p.setOnlyHighValue,
    setTestMatrixStatusMap: p.setTestMatrixStatusMap,
    setTestMatrixNoteMap: p.setTestMatrixNoteMap,
    setChangeControlBusy: p.setChangeControlBusy,
    setChangeControlNotice: p.setChangeControlNotice,
    setOpsCopyNotice: p.setOpsCopyNotice,
    setTemplateBusy: p.setTemplateBusy,
    setTemplateNotice: p.setTemplateNotice,
    setTemplateCategory: p.setTemplateCategory,
    setTemplateKeywordsText: p.setTemplateKeywordsText,
    setTemplateCommandsText: p.setTemplateCommandsText,
    setTemplateNote: p.setTemplateNote,
    onChatInputChange: p.onChatInputChange,
    onChatSend: p.onChatSend,
    onUpdateTestMatrixExecution: p.onUpdateTestMatrixExecution,
    onGenerateTestArtifacts: p.onGenerateTestArtifacts,
    onRefreshReleaseReview: p.onRefreshReleaseReview,
    reloadOpsTemplates: p.reloadOpsTemplates,
    buildOpsCommandTemplates: p.buildOpsCommandTemplates,
  } as const;
}
