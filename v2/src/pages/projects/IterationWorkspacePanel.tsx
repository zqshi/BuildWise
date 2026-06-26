import { AnalysisDrawerContent } from "./AnalysisDrawerContent";
import { InteractionDrawerContent } from "./InteractionDrawerContent";
import { FilePreviewDrawer } from "./FilePreviewDrawer";
import { ChatPanelArticle, UploadToast } from "./IterationWorkspacePanels";
import { useIterationWorkspaceState } from "./useIterationWorkspaceState";
import type { IterationWorkspacePanelProps } from "./iterationWorkspacePanelTypes";

type HookState = ReturnType<typeof useIterationWorkspaceState>;

export function IterationWorkspacePanel(props: IterationWorkspacePanelProps) {
  const s = useIterationWorkspaceState(props);
  return (
    <>
      <ChatPanelArticle
        currentIteration={props.currentIteration} error={props.error}
        contextData={props.contextData} stateMachine={props.stateMachine}
        chatMessages={props.chatMessages} chatSendStatus={props.chatSendStatus}
        fullCycleJob={props.fullCycleJob}
        chatInput={props.chatInput} fileInputRef={props.fileInputRef}
        isAnalyzingAttachment={props.isAnalyzingAttachment}
        uploadAnalysisProgress={props.uploadAnalysisProgress} lastUploadFailed={props.lastUploadFailed}
        onUpload={props.onUpload} onUploadFiles={props.onUploadFiles}
        onUploadClick={props.onUploadClick} onRetryUpload={props.onRetryUpload}
        onChatInputChange={props.onChatInputChange} onTransitionState={props.onTransitionState}
        onCancelFullCycle={props.onCancelFullCycle}
        onSwitchToProjectPanel={props.onSwitchToProjectPanel} onConfirmArtifact={props.onConfirmArtifact}
        showInteractionPanel={s.showInteractionPanel} interactionDrawerWidth={s.interactionDrawerWidth}
        dragOver={s.dragOver} setDragOver={s.setDragOver} chatBodyRef={s.chatBodyRef}
        artifactItems={s.artifactItems} canOpenAnalysisPanel={s.canOpenAnalysisPanel}
        reportConfirmedAt={s.reportConfirmedAt} chatLlmPercent={s.chatLlmPercent}
        isChatProcessing={s.isChatProcessing}
        artifactGenDeclared={s.artifactGenDeclared} artifactGenCompleted={s.artifactGenCompleted}
        artifactGenInProgress={s.artifactGenInProgress} artifactGenAllDone={s.artifactGenAllDone}
        openAnalysisDrawer={s.openAnalysisDrawer} openArtifactPreviewByTitle={s.openArtifactPreviewByTitle}
        openFilePreview={s.openFilePreview} handleConfirmAnalysis={s.handleConfirmAnalysis}
        handleComposedSend={s.handleComposedSend} chatComposerInputRef={s.chatComposerInputRef}
      />
      <UploadToast uploadToastMessage={props.uploadToastMessage} onClearUploadToast={props.onClearUploadToast} />
      {renderRightDrawer(props, s)}
      {renderInteractionDrawer(s)}
    </>
  );
}

function renderRightDrawer(props: IterationWorkspacePanelProps, s: HookState) {
  if (!props.showAnalysisPanel) return null;
  if (s.previewFile) {
    return (
      <FilePreviewDrawer previewFile={s.previewFile} previewSiblingFiles={s.previewSiblingFiles}
        artifactDrawerWidth={s.artifactDrawerWidth}
        handleArtifactDrawerResizePointerDown={s.handleArtifactDrawerResizePointerDown} onClose={s.closeFilePreview} />
    );
  }
  return renderAnalysisDrawer(props, s);
}

function renderAnalysisDrawer(props: IterationWorkspacePanelProps, s: HookState) {
  return (
    <AnalysisDrawerContent
      analysisReport={props.analysisReport} currentIteration={props.currentIteration}
      selectedDrawerArtifact={s.selectedDrawerArtifact} selectedArtifactKind={s.selectedArtifactKind}
      artifactEditorValue={s.artifactEditorValue} artifactEditorDirty={s.artifactEditorDirty}
      artifactEditorBusy={s.artifactEditorBusy} artifactEditorMode={s.artifactEditorMode}
      artifactEditorSource={s.artifactEditorSource} isEditableTextArtifact={s.isEditableTextArtifact}
      canEditSelectedTextArtifact={s.canEditSelectedTextArtifact}
      selectedArtifactAwaitingConfirmation={s.selectedArtifactAwaitingConfirmation}
      analysisDraftSections={s.analysisDraftSections} artifactDraftContent={s.artifactDraftContent}
      selectedArtifactHtmlPreview={s.selectedArtifactHtmlPreview} selectedArtifactHtmlContent={s.selectedArtifactHtmlContent}
      selectedHtmlPreview={s.selectedHtmlPreview} selectedHtmlElement={s.selectedHtmlElement}
      interactionEditMode={s.interactionEditMode} htmlPreviewHistory={s.htmlPreviewHistory}
      interactionInstruction={s.interactionInstruction} generatedTestMatrix={s.generatedTestMatrix}
      testMatrixStatusMap={s.testMatrixStatusMap} testMatrixNoteMap={s.testMatrixNoteMap}
      matrixSummary={s.matrixSummary} onlyHighValue={s.onlyHighValue}
      visiblePrioritizedFindings={s.visiblePrioritizedFindings} coachGuidance={s.coachGuidance}
      businessConfirmation={s.businessConfirmation} materialRisks={s.materialRisks}
      materialSuggestions={s.materialSuggestions} showAdvancedReportSections={s.showAdvancedReportSections}
      hasBaselineComparison={s.hasBaselineComparison} traceabilityMap={s.traceabilityMap}
      executableConstraints={s.executableConstraints} versionDiffDetailed={s.versionDiffDetailed}
      releaseReview={s.releaseReview} domainKnowledge={s.domainKnowledge}
      opsTriage={s.opsTriage} qualityArtifacts={s.qualityArtifacts}
      diffLocations={s.diffLocations} diffAdded={s.diffAdded} diffChanged={s.diffChanged} diffRemoved={s.diffRemoved}
      reportPendingConfirmation={s.reportPendingConfirmation} reportConfirmedAt={s.reportConfirmedAt}
      confirmedUnderstanding={s.confirmedUnderstanding} clarificationQuestions={s.clarificationQuestions}
      changeControlBusy={s.changeControlBusy} changeControlNotice={s.changeControlNotice}
      opsCopyNotice={s.opsCopyNotice} templateBusy={s.templateBusy} templateNotice={s.templateNotice}
      templateCategory={s.templateCategory} templateKeywordsText={s.templateKeywordsText}
      templateCommandsText={s.templateCommandsText} templateNote={s.templateNote}
      opsTemplates={s.opsTemplates} imagePrototypePreviews={s.imagePrototypePreviews}
      artifactDrawerWidth={s.artifactDrawerWidth} analysisScrollRef={s.analysisScrollRef}
      artifactHtmlPreviewFrameRef={s.artifactHtmlPreviewFrameRef}
      onCloseAnalysisPanel={props.onCloseAnalysisPanel} onChatInputChange={props.onChatInputChange}
      onChatSend={props.onChatSend}
      handleSaveArtifactEditor={s.handleSaveArtifactEditor} handleSubmitArtifactForReview={s.handleSubmitArtifactForReview}
      handleConfirmSelectedArtifact={s.handleConfirmSelectedArtifact} handleRequestArtifactRevision={s.handleRequestArtifactRevision}
      onUpdateTestMatrixExecution={props.onUpdateTestMatrixExecution}
      onGenerateTestArtifacts={props.onGenerateTestArtifacts} onRefreshReleaseReview={props.onRefreshReleaseReview}
      setArtifactEditorValue={s.setArtifactEditorValue} setArtifactEditorDirty={s.setArtifactEditorDirty}
      setArtifactEditorMode={s.setArtifactEditorMode} setArtifactEditorBusy={s.setArtifactEditorBusy}
      setChangeControlBusy={s.setChangeControlBusy} setChangeControlNotice={s.setChangeControlNotice}
      setOpsCopyNotice={s.setOpsCopyNotice} setTestMatrixStatusMap={s.setTestMatrixStatusMap}
      setTestMatrixNoteMap={s.setTestMatrixNoteMap} setOnlyHighValue={s.setOnlyHighValue}
      setTemplateBusy={s.setTemplateBusy} setTemplateNotice={s.setTemplateNotice}
      setTemplateCategory={s.setTemplateCategory} setTemplateKeywordsText={s.setTemplateKeywordsText}
      setTemplateCommandsText={s.setTemplateCommandsText} setTemplateNote={s.setTemplateNote}
      setInteractionEditMode={s.setInteractionEditMode} setInteractionInstruction={s.setInteractionInstruction}
      setSelectedHtmlElement={s.setSelectedHtmlElement} setHoveredHtmlElement={s.setHoveredHtmlElement}
      setHtmlPreviewHistory={s.setHtmlPreviewHistory}
      handleArtifactDrawerResizePointerDown={s.handleArtifactDrawerResizePointerDown}
      handleUndoHtmlPreview={s.handleUndoHtmlPreview} sendInteractionInstruction={s.sendInteractionInstruction}
      showInteractionEntry={s.showInteractionEntry} openInteractionPanel={s.openInteractionPanel}
      reloadOpsTemplates={s.reloadOpsTemplates} buildOpsCommandTemplates={s.buildOpsCommandTemplates}
    />
  );
}

function renderInteractionDrawer(s: HookState) {
  return (
    <InteractionDrawerContent
      showInteractionPanel={s.showInteractionPanel} interactionEditMode={s.interactionEditMode}
      interactionDrawerWidth={s.interactionDrawerWidth} htmlPrototypePreviews={s.htmlPrototypePreviews}
      selectedHtmlPreview={s.selectedHtmlPreview} instrumentedHtmlPreview={s.instrumentedHtmlPreview}
      imagePrototypePreviews={s.imagePrototypePreviews} selectedImagePreview={s.selectedImagePreview}
      prototypeElements={s.prototypeElements} prototypeTree={s.prototypeTree}
      selectedPrototypeElement={s.selectedPrototypeElement} selectedPrototypeElementId={s.selectedPrototypeElementId}
      prototypeLastPlan={s.prototypeLastPlan} prototypeHistory={s.prototypeHistory}
      hasRichInteractionPreview={s.hasRichInteractionPreview} interactionInstruction={s.interactionInstruction}
      imageSelectionSummary={s.imageSelectionSummary} selectedHtmlElement={s.selectedHtmlElement}
      selectedImageRegion={s.selectedImageRegion} selectedImagePoint={s.selectedImagePoint}
      dragImageRegion={s.dragImageRegion} htmlPreviewHistory={s.htmlPreviewHistory}
      htmlPreviewFrameRef={s.htmlPreviewFrameRef} imageWrapRef={s.imageWrapRef}
      setShowInteractionPanel={s.setShowInteractionPanel} setInteractionEditMode={s.setInteractionEditMode}
      setSelectedHtmlPreviewPath={s.setSelectedHtmlPreviewPath} setSelectedImagePreviewPath={s.setSelectedImagePreviewPath}
      setSelectedPrototypeElementId={s.setSelectedPrototypeElementId} setPrototypeElements={s.setPrototypeElements}
      setPrototypeLastPlan={s.setPrototypeLastPlan} setPrototypeHistory={s.setPrototypeHistory}
      setInteractionInstruction={s.setInteractionInstruction}
      setSelectedImagePoint={s.setSelectedImagePoint} setSelectedImageRegion={s.setSelectedImageRegion}
      handleInteractionDrawerResizePointerDown={s.handleInteractionDrawerResizePointerDown}
      handleImagePointerDown={s.handleImagePointerDown} handleImagePointerMove={s.handleImagePointerMove}
      handleImagePointerUp={s.handleImagePointerUp} handleImagePointerCancel={s.handleImagePointerCancel}
      handleUndoHtmlPreview={s.handleUndoHtmlPreview} sendInteractionInstruction={s.sendInteractionInstruction}
    />
  );
}
