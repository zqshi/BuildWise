import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnalysisDrawerContent } from "./AnalysisDrawerContent";
import { InteractionDrawerContent } from "./InteractionDrawerContent";
// deleteOpsTriageTemplate, upsertOpsTriageTemplate reserved for future use
import { useDrawerResize } from "./useDrawerResize";
import { useOpsTemplates } from "./useOpsTemplates";
import { usePrototypeInteraction } from "./usePrototypeInteraction";
import { useChangeControlForm } from "../../hooks/useChangeControlForm";
import { useTestMatrixForm } from "../../hooks/useTestMatrixForm";
import { useOpsTemplateForm } from "../../hooks/useOpsTemplateForm";
import { useArtifactEditorState } from "../../hooks/useArtifactEditorState";
import { useHtmlPreviewInteraction } from "../../hooks/useHtmlPreviewInteraction";
import { useAnalysisReportDerived } from "../../hooks/useAnalysisReportDerived";
import { useArtifactEditorActions } from "../../hooks/useArtifactEditorActions";
import { IterationStatusStrip } from "./IterationStatusStrip";
import { ChatMessageList } from "./ChatMessageList";
import { UploadProgressBar } from "./UploadProgressBar";
import { ChatComposer } from "./ChatComposer";
// ArtifactImpactPanel reserved for future use
import type {
  PrototypeElement,
  PrototypeChangeHistoryItem,
  IterationWorkspacePanelProps,
} from "./iterationWorkspacePanelTypes";
import {
  instrumentHtmlPreview
} from "./iterationWorkspacePanelUtils";

export function IterationWorkspacePanel({
  currentIteration,
  error,
  contextData,
  stateMachine,
  chatMessages,
  chatSendStatus,
  chatInput,
  fileInputRef,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  lastUploadFailed,
  uploadAnalysisProgress,
  uploadToastMessage,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onClearUploadToast,
  onUpload,
  onUploadFiles,
  onRetryUpload,
  onChatInputChange,
  onChatSend,
  onUpdateClarificationDraft: _onUpdateClarificationDraft,
  onConfirmIterationAnalysis: _onConfirmIterationAnalysis,
  onUpdateIterationBoundary: _onUpdateIterationBoundary,
  onUpdateTestMatrixExecution,
  onGenerateTestArtifacts,
  onRefreshReleaseReview,
  onSaveArtifactDraft,
  onCommitArtifact,
  onConfirmArtifact,
  onAppendArtifactToChat: _onAppendArtifactToChat,
  onTransitionArtifactStage: _onTransitionArtifactStage,
  onTransitionState,
  onSwitchToProjectPanel,
  onPatchUploadedHtmlPreview
}: IterationWorkspacePanelProps) {
  const defaultPrototypeElements: PrototypeElement[] = [
    { id: "page-title", page: "首页", component: "Header", label: "项目工作台", background: "#0ea5e9", color: "#ffffff", visible: true, emphasized: true, width: 460, height: 52 },
    { id: "search-input", page: "首页", component: "Header", label: "搜索项目、需求、任务", background: "#ffffff", color: "#334155", visible: true, emphasized: false, width: 460, height: 42 },
    { id: "nav-tab", page: "首页", component: "Tabs", label: "迭代 / 需求 / 发布", background: "#f1f5f9", color: "#0f172a", visible: true, emphasized: false, width: 460, height: 44 },
    { id: "primary-cta", page: "首页", component: "Actions", label: "创建迭代", background: "#2563eb", color: "#ffffff", visible: true, emphasized: true, width: 220, height: 44 },
    { id: "task-card", page: "首页", component: "Cards", label: "卡片：待澄清问题", background: "#ffffff", color: "#0f172a", visible: true, emphasized: false, width: 460, height: 92 }
  ];

  // ── Extracted hooks ──
  const {
    interactionDrawerWidth, setInteractionDrawerWidth: _setInteractionDrawerWidth,
    artifactDrawerWidth, setArtifactDrawerWidth: _setArtifactDrawerWidth,
    handleInteractionDrawerResizePointerDown,
    handleArtifactDrawerResizePointerDown,
  } = useDrawerResize();
  const { opsTemplates, setOpsTemplates: _setOpsTemplates, reloadOpsTemplates, buildOpsCommandTemplates } = useOpsTemplates(currentIteration?.projectId);

  const {
    changeControlBusy, setChangeControlBusy,
    changeControlNotice, setChangeControlNotice,
  } = useChangeControlForm(currentIteration);

  const {
    testMatrixStatusMap, setTestMatrixStatusMap,
    testMatrixNoteMap, setTestMatrixNoteMap,
  } = useTestMatrixForm(currentIteration);

  const {
    templateBusy, setTemplateBusy,
    templateNotice, setTemplateNotice,
    templateCategory, setTemplateCategory,
    templateKeywordsText, setTemplateKeywordsText,
    templateCommandsText, setTemplateCommandsText,
    templateNote, setTemplateNote,
    opsCopyNotice, setOpsCopyNotice,
  } = useOpsTemplateForm();

  const [onlyHighValue, setOnlyHighValue] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [interactionEditMode, setInteractionEditMode] = useState(false);

  const {
    interactionInstruction, setInteractionInstruction,
    hoveredHtmlElement: _hoveredHtmlElement, setHoveredHtmlElement,
    selectedHtmlElement, setSelectedHtmlElement,
    htmlPreviewHistory, setHtmlPreviewHistory,
    htmlPreviewFrameRef,
    artifactHtmlPreviewFrameRef,
    selectedHtmlPreview,
    selectedHtmlPreviewPath: _selectedHtmlPreviewPath, setSelectedHtmlPreviewPath,
    htmlPrototypePreviews,
    applyActionsToHtmlContent,
    getActiveHtmlPreviewWindow,
    applyHtmlActionsToPreview,
  } = useHtmlPreviewInteraction(uploadedFile, interactionEditMode);

  // ── Extracted hook (depends on interactionEditMode) ──
  const {
    selectedImagePoint, setSelectedImagePoint,
    selectedImageRegion, setSelectedImageRegion,
    dragImageRegion, setDragImageRegion,
    imageWrapRef,
    toPercentPoint: _toPercentPoint,
    handleImagePointerDown, handleImagePointerMove,
    handleImagePointerUp, handleImagePointerCancel,
    finalizeImageSelection: _finalizeImageSelection,
    applyPrototypeInstruction: applyPrototypeInstructionHook,
  } = usePrototypeInteraction(interactionEditMode);

  const [selectedPrototypeElementId, setSelectedPrototypeElementId] = useState("page-title");
  const [prototypeElements, setPrototypeElements] = useState<PrototypeElement[]>(defaultPrototypeElements);
  const [prototypeLastPlan, setPrototypeLastPlan] = useState<string[]>([]);
  const [prototypeHistory, setPrototypeHistory] = useState<PrototypeChangeHistoryItem[]>([]);
  const [selectedImagePreviewPath, setSelectedImagePreviewPath] = useState("");

  const {
    artifactItems,
    activeArtifactStage,
    analysisDrawerArtifactId: _analysisDrawerArtifactId, setAnalysisDrawerArtifactId,
    selectedDrawerArtifact,
    selectedArtifactKind,
    artifactDraftContent,
    isEditableTextArtifact,
    artifactEditorSource,
    artifactEditorValue, setArtifactEditorValue,
    artifactEditorDirty, setArtifactEditorDirty,
    artifactEditorBusy, setArtifactEditorBusy,
    artifactEditorMode, setArtifactEditorMode,
    selectedArtifactHtmlContent,
    selectedArtifactHtmlPreview,
    analysisDraftSections,
    selectedArtifactAwaitingConfirmation,
    canEditSelectedTextArtifact,
  } = useArtifactEditorState(currentIteration, selectedHtmlPreview, interactionEditMode);

  const chatComposerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const analysisScrollRef = useRef<HTMLDivElement | null>(null);

  const imagePrototypePreviews = uploadedFile?.imagePreviews ?? [];
  const selectedImagePreview =
    imagePrototypePreviews.find((item) => item.path === selectedImagePreviewPath) || imagePrototypePreviews[0] || null;
  const hasRichInteractionPreview = Boolean(
    (htmlPrototypePreviews.length > 0 && selectedHtmlPreview) || (imagePrototypePreviews.length > 0 && selectedImagePreview)
  );
  const instrumentedHtmlPreview = useMemo(
    () => (selectedHtmlPreview ? instrumentHtmlPreview(selectedHtmlPreview.content, interactionEditMode) : ""),
    [selectedHtmlPreview?.path, selectedHtmlPreview?.content, interactionEditMode]
  );
  const imageSelectionSummary = selectedImageRegion
    ? `区域 x=${selectedImageRegion.xPercent.toFixed(1)}% y=${selectedImageRegion.yPercent.toFixed(1)}% w=${selectedImageRegion.widthPercent.toFixed(
        1
      )}% h=${selectedImageRegion.heightPercent.toFixed(1)}%`
    : selectedImagePoint
      ? `点位 x=${selectedImagePoint.xPercent.toFixed(1)}% y=${selectedImagePoint.yPercent.toFixed(1)}%`
      : "";
  const selectedPrototypeElement = prototypeElements.find((item) => item.id === selectedPrototypeElementId) || null;
  const prototypeTree = prototypeElements.reduce<Record<string, Record<string, PrototypeElement[]>>>((acc, item) => {
    if (!acc[item.page]) {
      acc[item.page] = {};
    }
    if (!acc[item.page][item.component]) {
      acc[item.page][item.component] = [];
    }
    acc[item.page][item.component].push(item);
    return acc;
  }, {});
  const showInteractionEntry = true;

  // ── derived report data (extracted to hook) ──
  const {
    diffLocations, diffAdded, diffChanged, diffRemoved,
    hasBaselineComparison, showAdvancedReportSections,
    lastUploadMessageId, canOpenAnalysisPanel,
    materialRisks, materialSuggestions,
    traceabilityMap, executableConstraints, versionDiffDetailed,
    releaseReview, domainKnowledge, opsTriage, qualityArtifacts,
    visiblePrioritizedFindings, clarificationQuestions,
    generatedTestMatrix, matrixSummary,
    reportPendingConfirmation, reportConfirmedAt, confirmedUnderstanding
  } = useAnalysisReportDerived(
    analysisReport, currentIteration, chatMessages,
    isAnalyzingAttachment, testMatrixStatusMap, onlyHighValue
  );

  // ── Prototype mapping effect ──
  useEffect(() => {
    if (!uploadedFile?.hasPrototypeAssets) {
      return;
    }
    const mapped = (uploadedFile.prototypeItems || []).slice(0, 12).map((item, index) => {
      const normalized = item.replace(/\\/g, "/");
      const parts = normalized.split("/").filter(Boolean);
      const fileName = parts[parts.length - 1] || `原型元素-${index + 1}`;
      const page = parts.length >= 3 ? parts[0] : "原型主页面";
      const component = parts.length >= 2 ? parts[parts.length - 2] : "主区域";
      return {
        id: `proto-${index}`,
        page,
        component,
        label: fileName,
        background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
        color: "#0f172a",
        visible: true,
        emphasized: index === 0,
        width: /mobile|phone|h5/i.test(normalized) ? 320 : 460,
        height: /card|panel|list/i.test(normalized) ? 88 : 48
      } as PrototypeElement;
    });
    if (mapped.length > 0) {
      setPrototypeElements(mapped);
      setSelectedPrototypeElementId(mapped[0].id);
    } else {
      setPrototypeElements(defaultPrototypeElements);
      setSelectedPrototypeElementId(defaultPrototypeElements[0].id);
    }
  }, [uploadedFile?.iterationId, uploadedFile?.hasPrototypeAssets, uploadedFile?.prototypeItems]);

  useEffect(() => {
    const previews = uploadedFile?.imagePreviews ?? [];
    if (previews.length === 0) {
      setSelectedImagePreviewPath("");
      setSelectedImagePoint(null);
      setSelectedImageRegion(null);
      return;
    }
    setSelectedImagePreviewPath((prev) => (previews.some((item) => item.path === prev) ? prev : previews[0].path));
  }, [uploadedFile?.iterationId, uploadedFile?.imagePreviews]);

  // ── Interaction-mode clearing ──
  useEffect(() => {
    if (interactionEditMode) {
      return;
    }
    setSelectedImagePoint(null);
    setSelectedImageRegion(null);
    setDragImageRegion(null);
  }, [interactionEditMode]);

  // ── Artifact helpers ──
  const findPreferredArtifactForStage = (stage: typeof activeArtifactStage) =>
    artifactItems.find((item) => item.stage === stage) || artifactItems[0] || null;

  const openAnalysisDrawer = () => {
    const preferred = findPreferredArtifactForStage(activeArtifactStage);
    setAnalysisDrawerArtifactId(preferred?.id || null);
    onOpenAnalysisPanel();
  };

  const openArtifactPreviewById = (artifactId: string) => {
    setAnalysisDrawerArtifactId(artifactId);
    onOpenAnalysisPanel();
  };

  const openArtifactPreviewByTitle = (title: string) => {
    const matched = artifactItems.find((item) => item.title === title);
    if (!matched) {
      openAnalysisDrawer();
      return;
    }
    openArtifactPreviewById(matched.id);
  };

  const applyPrototypeInstruction = (instruction: string) =>
    applyPrototypeInstructionHook(instruction, selectedPrototypeElement, setPrototypeElements, setPrototypeLastPlan, setPrototypeHistory);

  const handleUndoHtmlPreview = () => {
    const latest = htmlPreviewHistory[0];
    if (!latest) {
      return;
    }
    const frameWindow = getActiveHtmlPreviewWindow(showAnalysisPanel, selectedArtifactKind);
    if (!frameWindow) {
      return;
    }
    frameWindow.postMessage(
      {
        source: "buildwise-visual-edit-host",
        type: "restore-snapshot",
        payload: {
          selector: latest.selector,
          snapshot: {
            text: latest.text,
            styles: latest.styles
          }
        }
      },
      "*" // srcdoc iframe has origin "null", targetOrigin must be "*"; security enforced by source field check on receive side
    );
    if (latest.artifactId) {
      void onSaveArtifactDraft(latest.artifactId, { content: latest.content, actor: "OpenClaw Agent" });
    } else if (latest.path) {
      onPatchUploadedHtmlPreview?.(latest.path, latest.content);
    }
    setHtmlPreviewHistory((prev) => prev.slice(1));
  };

  const sendInteractionInstruction = async (instruction: string) => {
    const text = instruction.trim();
    if (!text) {
      return;
    }
    const htmlInteractionInDrawer = showAnalysisPanel && selectedArtifactKind === "html-prototype" && selectedDrawerArtifact;
    const htmlInteractionEnabled = interactionEditMode && (showInteractionPanel || htmlInteractionInDrawer);
    const htmlInteractionSource = htmlInteractionInDrawer ? selectedArtifactHtmlContent : selectedHtmlPreview?.content || "";
    const htmlInteractionPath = htmlInteractionInDrawer ? "" : selectedHtmlPreview?.path || "";
    if (htmlInteractionEnabled && /撤销|回退/.test(text) && htmlPreviewHistory.length > 0) {
      handleUndoHtmlPreview();
      await onChatSend({
        overrideText: text,
        prototypeTarget: selectedHtmlElement?.selector || "当前元素",
        prototypeSummary: "已撤销上一步预览修改",
        interactionContext: {
          mode: "html",
          target: selectedHtmlElement?.selector || "当前元素",
          summary: "undo-last-step"
        }
      });
      return;
    }
    if (htmlInteractionEnabled && htmlInteractionSource && selectedHtmlElement) {
      const summary = `selector=${selectedHtmlElement.selector}; tag=${selectedHtmlElement.tag}; text=${selectedHtmlElement.text || "无"}; color=${selectedHtmlElement.styles.color}; bg=${selectedHtmlElement.styles.backgroundColor}; fontSize=${selectedHtmlElement.styles.fontSize}`;
      const result = await onChatSend({
        overrideText: text,
        prototypeTarget: selectedHtmlElement.selector || selectedHtmlElement.tag,
        prototypeSummary: summary,
        interactionContext: {
          mode: "html",
          target: selectedHtmlElement.selector || selectedHtmlElement.tag,
          summary,
          html: {
            selector: selectedHtmlElement.selector,
            tag: selectedHtmlElement.tag,
            text: selectedHtmlElement.text,
            styles: selectedHtmlElement.styles
          }
        }
      });
      if (result?.actions?.length) {
        const nextContent = applyActionsToHtmlContent(htmlInteractionSource, selectedHtmlElement.selector, result);
        if (nextContent !== htmlInteractionSource) {
          if (htmlInteractionInDrawer && selectedDrawerArtifact) {
            await onSaveArtifactDraft(selectedDrawerArtifact.id, { content: nextContent, actor: "OpenClaw Agent" });
          } else if (htmlInteractionPath) {
            onPatchUploadedHtmlPreview?.(htmlInteractionPath, nextContent);
          }
        }
        setHtmlPreviewHistory((prev) => [
          {
            path: htmlInteractionPath,
            artifactId: htmlInteractionInDrawer && selectedDrawerArtifact ? selectedDrawerArtifact.id : undefined,
            content: htmlInteractionSource,
            selector: selectedHtmlElement.selector,
            text: selectedHtmlElement.text,
            styles: {
              color: selectedHtmlElement.styles.color,
              backgroundColor: selectedHtmlElement.styles.backgroundColor,
              fontSize: selectedHtmlElement.styles.fontSize,
              fontWeight: selectedHtmlElement.styles.fontWeight
            }
          },
          ...prev
        ].slice(0, 20));
        applyHtmlActionsToPreview(selectedHtmlElement.selector, result, showAnalysisPanel, selectedArtifactKind);
      }
      return;
    }
    if (showInteractionPanel && interactionEditMode && selectedImagePreview && (selectedImageRegion || selectedImagePoint)) {
      const summary = `${imageSelectionSummary}; 文件=${selectedImagePreview.path}`;
      await onChatSend({
        overrideText: text,
        prototypeTarget: `截图:${selectedImagePreview.name}`,
        prototypeSummary: summary,
        interactionContext: {
          mode: "image",
          target: `截图:${selectedImagePreview.name}`,
          summary
        }
      });
      return;
    }
    if (showInteractionPanel && selectedPrototypeElement) {
      const result = applyPrototypeInstruction(text);
      await onChatSend({
        overrideText: text,
        prototypeTarget: selectedPrototypeElement.label,
        prototypeSummary: result.summary,
        interactionContext: {
          mode: "prototype",
          target: selectedPrototypeElement.label,
          summary: result.summary
        }
      });
      return;
    }
    await onChatSend({ overrideText: text });
  };

  const handleComposedSend = () => {
    void sendInteractionInstruction(chatInput);
  };

  // ── Artifact editor actions (extracted to hook) ──
  const {
    handleSaveArtifactEditor,
    handleSubmitArtifactForReview,
    handleConfirmSelectedArtifact,
    handleRequestArtifactRevision
  } = useArtifactEditorActions({
    selectedDrawerArtifact,
    artifactEditorValue,
    artifactEditorDirty,
    artifactEditorBusy,
    chatInput,
    setArtifactEditorBusy,
    setArtifactEditorDirty,
    setArtifactEditorMode,
    setChangeControlNotice,
    setAnalysisDrawerArtifactId,
    onSaveArtifactDraft,
    onCommitArtifact,
    onConfirmArtifact,
    onOpenAnalysisPanel,
    onCloseAnalysisPanel,
    onChatInputChange,
    chatComposerInputRef
  });

  const openInteractionPanel = () => {
    onCloseAnalysisPanel();
    setShowInteractionPanel(true);
  };

  return (
    <>
      <article
        className={`panel chat-panel ${showInteractionPanel ? "interaction-companion-open" : ""}`}
        style={{ "--interaction-drawer-offset": `min(${interactionDrawerWidth}px, 100vw)` } as CSSProperties}
      >
        <div className="panel-head">
          <div className="panel-title-wrap">
            <button type="button" className="icon-btn" onClick={onSwitchToProjectPanel} aria-label="返回项目管理">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2>迭代内需求沟通</h2>
            <p className="hint">
              {currentIteration ? `当前迭代：${currentIteration.name}` : "请先在右侧选择迭代版本"}
            </p>
          </div>
        </div>
        {error ? (
          <div className="inline-error-banner" role="alert" aria-live="assertive">
            {error}
          </div>
        ) : null}
        <IterationStatusStrip
          currentIteration={currentIteration}
          stateMachine={stateMachine}
          contextData={contextData}
          onTransitionState={onTransitionState}
        />
        <div className="iteration-workbench-grid">
          <div className="iteration-chat-main">
            <div
              className={`chat-body ${dragOver ? "drop-active" : ""}`}
              ref={chatBodyRef}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                const files = Array.from(event.dataTransfer.files || []);
                if (files.length > 0) {
                  void onUploadFiles(files);
                }
              }}
            >
              <ChatMessageList
                chatMessages={chatMessages}
                artifactItems={artifactItems}
                canOpenAnalysisPanel={canOpenAnalysisPanel}
                showInteractionEntry={showInteractionEntry}
                analysisConfirmed={Boolean(reportConfirmedAt)}
                lastUploadMessageId={lastUploadMessageId}
                openAnalysisDrawer={openAnalysisDrawer}
                openInteractionPanel={openInteractionPanel}
                openArtifactPreviewByTitle={openArtifactPreviewByTitle}
                onConfirmAnalysis={() => {
                  void _onConfirmIterationAnalysis({
                    accurate: true,
                    decisionEvent: "understanding-accurate"
                  });
                }}
              />
            </div>
            <UploadProgressBar
              uploadAnalysisProgress={uploadAnalysisProgress}
              lastUploadFailed={lastUploadFailed}
              onRetryUpload={onRetryUpload}
            />
            <ChatComposer
              currentIteration={currentIteration}
              chatInput={chatInput}
              chatSendStatus={chatSendStatus}
              fileInputRef={fileInputRef}
              isAnalyzingAttachment={isAnalyzingAttachment}
              onUpload={onUpload}
              onUploadFiles={onUploadFiles}
              onUploadClick={onUploadClick}
              onChatInputChange={onChatInputChange}
              onComposedSend={handleComposedSend}
              chatComposerInputRef={chatComposerInputRef}
            />
          </div>
        </div>
      </article>
      {uploadToastMessage ? (
        <div className="upload-toast" role="status" aria-live="polite">
          <span>{uploadToastMessage}</span>
          <button type="button" className="btn ghost mini upload-toast-close" onClick={onClearUploadToast}>
            关闭
          </button>
        </div>
      ) : null}

      {showAnalysisPanel ? (
        <AnalysisDrawerContent
          analysisReport={analysisReport}
          currentIteration={currentIteration}
          selectedDrawerArtifact={selectedDrawerArtifact}
          selectedArtifactKind={selectedArtifactKind}
          artifactEditorValue={artifactEditorValue}
          artifactEditorDirty={artifactEditorDirty}
          artifactEditorBusy={artifactEditorBusy}
          artifactEditorMode={artifactEditorMode}
          artifactEditorSource={artifactEditorSource}
          isEditableTextArtifact={isEditableTextArtifact}
          canEditSelectedTextArtifact={canEditSelectedTextArtifact}
          selectedArtifactAwaitingConfirmation={selectedArtifactAwaitingConfirmation}
          analysisDraftSections={analysisDraftSections}
          artifactDraftContent={artifactDraftContent}
          selectedArtifactHtmlPreview={selectedArtifactHtmlPreview}
          selectedArtifactHtmlContent={selectedArtifactHtmlContent}
          selectedHtmlPreview={selectedHtmlPreview}
          selectedHtmlElement={selectedHtmlElement}
          interactionEditMode={interactionEditMode}
          htmlPreviewHistory={htmlPreviewHistory}
          interactionInstruction={interactionInstruction}
          generatedTestMatrix={generatedTestMatrix}
          testMatrixStatusMap={testMatrixStatusMap}
          testMatrixNoteMap={testMatrixNoteMap}
          matrixSummary={matrixSummary}
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
          opsTriage={opsTriage}
          qualityArtifacts={qualityArtifacts}
          diffLocations={diffLocations}
          diffAdded={diffAdded}
          diffChanged={diffChanged}
          diffRemoved={diffRemoved}
          reportPendingConfirmation={reportPendingConfirmation}
          reportConfirmedAt={reportConfirmedAt}
          confirmedUnderstanding={confirmedUnderstanding}
          clarificationQuestions={clarificationQuestions}
          changeControlBusy={changeControlBusy}
          changeControlNotice={changeControlNotice}
          opsCopyNotice={opsCopyNotice}
          templateBusy={templateBusy}
          templateNotice={templateNotice}
          templateCategory={templateCategory}
          templateKeywordsText={templateKeywordsText}
          templateCommandsText={templateCommandsText}
          templateNote={templateNote}
          opsTemplates={opsTemplates}
          imagePrototypePreviews={imagePrototypePreviews}
          artifactDrawerWidth={artifactDrawerWidth}
          analysisScrollRef={analysisScrollRef}
          artifactHtmlPreviewFrameRef={artifactHtmlPreviewFrameRef}
          onCloseAnalysisPanel={onCloseAnalysisPanel}
          onChatInputChange={onChatInputChange}
          onChatSend={onChatSend}
          handleSaveArtifactEditor={handleSaveArtifactEditor}
          handleSubmitArtifactForReview={handleSubmitArtifactForReview}
          handleConfirmSelectedArtifact={handleConfirmSelectedArtifact}
          handleRequestArtifactRevision={handleRequestArtifactRevision}
          onUpdateTestMatrixExecution={onUpdateTestMatrixExecution}
          onGenerateTestArtifacts={onGenerateTestArtifacts}
          onRefreshReleaseReview={onRefreshReleaseReview}
          setArtifactEditorValue={setArtifactEditorValue}
          setArtifactEditorDirty={setArtifactEditorDirty}
          setArtifactEditorMode={setArtifactEditorMode}
          setArtifactEditorBusy={setArtifactEditorBusy}
          setChangeControlBusy={setChangeControlBusy}
          setChangeControlNotice={setChangeControlNotice}
          setOpsCopyNotice={setOpsCopyNotice}
          setTestMatrixStatusMap={setTestMatrixStatusMap}
          setTestMatrixNoteMap={setTestMatrixNoteMap}
          setOnlyHighValue={setOnlyHighValue}
          setTemplateBusy={setTemplateBusy}
          setTemplateNotice={setTemplateNotice}
          setTemplateCategory={setTemplateCategory}
          setTemplateKeywordsText={setTemplateKeywordsText}
          setTemplateCommandsText={setTemplateCommandsText}
          setTemplateNote={setTemplateNote}
          setInteractionEditMode={setInteractionEditMode}
          setInteractionInstruction={setInteractionInstruction}
          setSelectedHtmlElement={setSelectedHtmlElement}
          setHoveredHtmlElement={setHoveredHtmlElement}
          setHtmlPreviewHistory={setHtmlPreviewHistory}
          handleArtifactDrawerResizePointerDown={handleArtifactDrawerResizePointerDown}
          handleUndoHtmlPreview={handleUndoHtmlPreview}
          sendInteractionInstruction={sendInteractionInstruction}
          openInteractionPanel={openInteractionPanel}
          reloadOpsTemplates={reloadOpsTemplates}
          buildOpsCommandTemplates={buildOpsCommandTemplates}
        />
      ) : null}


      <InteractionDrawerContent
          showInteractionPanel={showInteractionPanel}
          interactionEditMode={interactionEditMode}
          interactionDrawerWidth={interactionDrawerWidth}
          htmlPrototypePreviews={htmlPrototypePreviews}
          selectedHtmlPreview={selectedHtmlPreview}
          instrumentedHtmlPreview={instrumentedHtmlPreview}
          imagePrototypePreviews={imagePrototypePreviews}
          selectedImagePreview={selectedImagePreview}
          prototypeElements={prototypeElements}
          prototypeTree={prototypeTree}
          selectedPrototypeElement={selectedPrototypeElement}
          selectedPrototypeElementId={selectedPrototypeElementId}
          prototypeLastPlan={prototypeLastPlan}
          prototypeHistory={prototypeHistory}
          hasRichInteractionPreview={hasRichInteractionPreview}
          interactionInstruction={interactionInstruction}
          imageSelectionSummary={imageSelectionSummary}
          selectedHtmlElement={selectedHtmlElement}
          selectedImageRegion={selectedImageRegion}
          selectedImagePoint={selectedImagePoint}
          dragImageRegion={dragImageRegion}
          htmlPreviewHistory={htmlPreviewHistory}
          htmlPreviewFrameRef={htmlPreviewFrameRef}
          imageWrapRef={imageWrapRef}
          setShowInteractionPanel={setShowInteractionPanel}
          setInteractionEditMode={setInteractionEditMode}
          setSelectedHtmlPreviewPath={setSelectedHtmlPreviewPath}
          setSelectedImagePreviewPath={setSelectedImagePreviewPath}
          setSelectedPrototypeElementId={setSelectedPrototypeElementId}
          setPrototypeElements={setPrototypeElements}
          setPrototypeLastPlan={setPrototypeLastPlan}
          setPrototypeHistory={setPrototypeHistory}
          setInteractionInstruction={setInteractionInstruction}
          setSelectedImagePoint={setSelectedImagePoint}
          setSelectedImageRegion={setSelectedImageRegion}
          handleInteractionDrawerResizePointerDown={handleInteractionDrawerResizePointerDown}
          handleImagePointerDown={handleImagePointerDown}
          handleImagePointerMove={handleImagePointerMove}
          handleImagePointerUp={handleImagePointerUp}
          handleImagePointerCancel={handleImagePointerCancel}
          handleUndoHtmlPreview={handleUndoHtmlPreview}
          sendInteractionInstruction={sendInteractionInstruction}
        />

    </>
  );
}
