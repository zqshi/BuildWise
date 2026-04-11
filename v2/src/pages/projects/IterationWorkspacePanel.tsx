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
import { useInteractionInstruction } from "./useInteractionInstruction";
import { IterationStatusStrip } from "./IterationStatusStrip";
import { ChatMessageList } from "./ChatMessageList";
import { UploadProgressBar } from "./UploadProgressBar";
import { LlmProcessingBar } from "./LlmProcessingBar";
import { ChatComposer } from "./ChatComposer";
import { ChangeImpactAlert } from "../../components/ChangeImpactAlert";
import { detectIterationChangeImpact } from "../../app/workspaceApiAgentOps";
import type { ChangeImpactResult } from "../../app/workspaceApiAgentOps";
import { downloadSingleFile } from "./UploadFileCard";
import type { UploadFileEntry } from "./UploadFileCard";
// ArtifactImpactPanel reserved for future use
import type {
  PrototypeElement,
  PrototypeChangeHistoryItem,
  IterationWorkspacePanelProps,
} from "./iterationWorkspacePanelTypes";
import {
  instrumentHtmlPreview
} from "./iterationWorkspacePanelUtils";

/** Resolve a local resource path against sibling files (handles ./prefix, folder/file, bare name) */
function findSiblingByRef(ref: string, siblings: UploadFileEntry[]): UploadFileEntry | undefined {
  const normalized = ref.replace(/^\.\//, "");
  return siblings.find((f) => {
    const p = (f.path || f.name).replace(/^\.\//, "");
    return p === normalized || p.endsWith(`/${normalized}`) || f.name === normalized;
  });
}

/** Inline local <script src> and <link href> references from sibling uploaded files */
function inlineHtmlResources(html: string, siblings: UploadFileEntry[]): string {
  if (siblings.length === 0) return html;
  // Inline <script src="local.js"> → <script>...content...</script>
  let result = html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
    (original, src: string) => {
      if (/^https?:\/\//i.test(src)) return original;
      const sibling = findSiblingByRef(src, siblings);
      if (sibling?.content) return `<script>${sibling.content}<\/script>`;
      return original;
    }
  );
  // Inline <link rel="stylesheet" href="local.css"> → <style>...content...</style>
  result = result.replace(
    /<link\s+[^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
    (original, href: string) => {
      if (/^https?:\/\//i.test(href)) return original;
      if (!/rel=["']stylesheet["']/i.test(original)) return original;
      const sibling = findSiblingByRef(href, siblings);
      if (sibling?.content) return `<style>${sibling.content}</style>`;
      return original;
    }
  );
  return result;
}

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

  // Simulated progress for chat LLM processing
  const [chatLlmPercent, setChatLlmPercent] = useState(0);
  const isChatProcessing = chatSendStatus === "processing" || chatSendStatus === "processing-executing" || chatSendStatus === "processing-artifacts" || chatSendStatus === "processing-full-cycle";
  // 交付物生成实时进度
  const ccRaw = currentIteration?.changeControl as Record<string, unknown> | undefined;
  const artifactGenDeclared = (ccRaw?.artifactGenerationArtifacts as string[] | undefined) ?? [];
  const artifactGenCompleted = (ccRaw?.artifactGenerationCompletedArtifacts as string[] | undefined) ?? [];
  const artifactGenInProgress = chatSendStatus === "processing-artifacts" && artifactGenDeclared.length > 0;
  const artifactGenAllDone = artifactGenInProgress && artifactGenCompleted.length >= artifactGenDeclared.length;
  useEffect(() => {
    if (chatSendStatus === "sending" || chatSendStatus === "sent") {
      setChatLlmPercent(10);
      return;
    }
    if (isChatProcessing) {
      const base = chatSendStatus === "processing-executing" ? 50
        : chatSendStatus === "processing-artifacts"
          ? (artifactGenDeclared.length > 0 && artifactGenCompleted.length > 0
            ? Math.max(75, Math.round((artifactGenCompleted.length / artifactGenDeclared.length) * 95))
            : 75)
        : chatSendStatus === "processing-full-cycle" ? 30
        : 15;
      setChatLlmPercent(base);
      const timer = setInterval(() => {
        setChatLlmPercent((prev) => (prev < 88 ? prev + (90 - prev) * 0.04 : prev));
      }, 600);
      return () => clearInterval(timer);
    }
    setChatLlmPercent(0);
  }, [chatSendStatus]);

  // Auto-scroll chat to bottom when messages change
  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadFileEntry | null>(null);
  const [previewSiblingFiles, setPreviewSiblingFiles] = useState<UploadFileEntry[]>([]);
  const [interactionEditMode, setInteractionEditMode] = useState(false);
  const [changeImpact, setChangeImpact] = useState<ChangeImpactResult | null>(null);

  // 变更影响检测：用户输入时 debounce 调用
  const changeImpactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentIteration || !chatInput.trim()) {
      return;
    }
    if (changeImpactTimerRef.current) clearTimeout(changeImpactTimerRef.current);
    changeImpactTimerRef.current = setTimeout(async () => {
      try {
        const result = await detectIterationChangeImpact(currentIteration.id, chatInput.trim());
        setChangeImpact(result);
      } catch (err) {
        console.debug("[IterationWorkspacePanel] 变更影响检测失败", err);
      }
    }, 800);
    return () => {
      if (changeImpactTimerRef.current) clearTimeout(changeImpactTimerRef.current);
    };
  }, [chatInput, currentIteration?.id]);

  // 发送消息后清除变更影响警示
  useEffect(() => {
    if (chatSendStatus === "sending") {
      setChangeImpact(null);
    }
  }, [chatSendStatus]);

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
  const showInteractionEntry = Boolean(uploadedFile?.hasPrototypeAssets);

  // ── derived report data (extracted to hook) ──
  const {
    diffLocations, diffAdded, diffChanged, diffRemoved,
    hasBaselineComparison, showAdvancedReportSections,
    canOpenAnalysisPanel,
    materialRisks, materialSuggestions,
    traceabilityMap, executableConstraints, versionDiffDetailed,
    releaseReview, domainKnowledge, opsTriage, qualityArtifacts,
    visiblePrioritizedFindings, clarificationQuestions,
    generatedTestMatrix, matrixSummary,
    reportPendingConfirmation, reportConfirmedAt, confirmedUnderstanding,
    businessConfirmation, coachGuidance
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
    setShowInteractionPanel(false);
    setPreviewFile(null);
    const preferred = findPreferredArtifactForStage(activeArtifactStage);
    setAnalysisDrawerArtifactId(preferred?.id || null);
    onOpenAnalysisPanel();
  };

  const openFilePreview = (file: UploadFileEntry, siblings?: UploadFileEntry[]) => {
    setShowInteractionPanel(false);
    setPreviewFile(file);
    setPreviewSiblingFiles(siblings || []);
    onOpenAnalysisPanel();
  };

  const closeFilePreview = () => {
    setPreviewFile(null);
    setPreviewSiblingFiles([]);
    onCloseAnalysisPanel();
  };

  const openArtifactPreviewById = (artifactId: string) => {
    setShowInteractionPanel(false);
    setPreviewFile(null);
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

  const { sendInteractionInstruction, handleUndoHtmlPreview } = useInteractionInstruction({
    interactionEditMode,
    showInteractionPanel,
    showAnalysisPanel,
    selectedArtifactKind,
    selectedHtmlElement,
    selectedHtmlPreview,
    selectedDrawerArtifact,
    selectedArtifactHtmlContent,
    selectedPrototypeElement,
    selectedImagePreview,
    selectedImageRegion,
    selectedImagePoint,
    imageSelectionSummary,
    htmlPreviewHistory,
    setHtmlPreviewHistory,
    applyActionsToHtmlContent,
    applyHtmlActionsToPreview,
    getActiveHtmlPreviewWindow,
    applyPrototypeInstruction,
    onChatSend,
    onSaveArtifactDraft,
    onPatchUploadedHtmlPreview
  });

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
    onConfirmAnalysis: () => _onConfirmIterationAnalysis({
      accurate: true,
      decisionEvent: "understanding-accurate",
      force: true,
      resolvedClarificationQuestions: Array.isArray(clarificationQuestions) ? clarificationQuestions : []
    }),
    onOpenAnalysisPanel,
    onCloseAnalysisPanel,
    onChatInputChange,
    chatComposerInputRef,
    onTriggerCoachFollowUp: (message: string) => void onChatSend({ overrideText: message })
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
                analysisConfirmed={Boolean(reportConfirmedAt)}
                chatSendStatus={chatSendStatus}
                openAnalysisDrawer={openAnalysisDrawer}
                openArtifactPreviewByTitle={openArtifactPreviewByTitle}
                onPreviewFile={openFilePreview}
                onConfirmAnalysis={() => {
                  // Also confirm the analysis-report artifact so gateStatus stays in sync
                  const confirmArtifactResult = onConfirmArtifact("analysis-report", {
                    actor: "项目负责人",
                    passed: true,
                  });
                  const confirmArtifactPromise = confirmArtifactResult && typeof (confirmArtifactResult as Promise<void>).then === "function"
                    ? (confirmArtifactResult as Promise<void>).catch((err: unknown) => {
                        console.warn("[IterationWorkspacePanel] analysis-report artifact confirm failed (non-blocking)", err);
                      })
                    : Promise.resolve();
                  const result = _onConfirmIterationAnalysis({
                    accurate: true,
                    decisionEvent: "understanding-accurate",
                    force: true,
                    resolvedClarificationQuestions: Array.isArray(clarificationQuestions) ? clarificationQuestions : []
                  });
                  if (result && typeof result.then === "function") {
                    void Promise.all([result, confirmArtifactPromise]).then(() => {
                      setChangeControlNotice("分析已确认。");
                    });
                  }
                }}
              />
            </div>
            <UploadProgressBar
              uploadAnalysisProgress={uploadAnalysisProgress}
              lastUploadFailed={lastUploadFailed}
              onRetryUpload={onRetryUpload}
            />
            {(chatSendStatus === "sending" || chatSendStatus === "sent" || isChatProcessing) && !isAnalyzingAttachment ? (
              <LlmProcessingBar
                label={
                  chatSendStatus === "sending" || chatSendStatus === "sent" ? "正在发送消息"
                  : chatSendStatus === "processing-executing" ? "AI 正在执行指令"
                  : chatSendStatus === "processing-artifacts"
                    ? (artifactGenAllDone ? "交付物生成完毕"
                      : artifactGenInProgress ? `正在生成交付物（${artifactGenCompleted.length}/${artifactGenDeclared.length} 已完成）`
                      : "AI 正在生成交付物")
                  : chatSendStatus === "processing-full-cycle" ? "全流程执行中"
                  : "AI 正在处理"
                }
                detail={
                  chatSendStatus === "sending" || chatSendStatus === "sent" ? "正在连接 AI 服务..."
                  : chatSendStatus === "processing-executing" ? "正在执行指令，请稍候..."
                  : chatSendStatus === "processing-artifacts"
                    ? (artifactGenAllDone
                      ? "所有交付物已生成，内容已更新到右侧面板。"
                      : artifactGenInProgress
                        ? `正在逐个生成，已完成：${artifactGenCompleted.length > 0 ? artifactGenCompleted.join("、") : "暂无"}。`
                        : "正在后台生成交付物内容，完成后会自动出现...")
                  : chatSendStatus === "processing-full-cycle" ? "正在按流程依次执行分析、确认、改写、测试等环节..."
                  : "正在等待大模型响应，请稍候..."
                }
                percent={Math.round(chatLlmPercent)}
                stage="running"
              />
            ) : null}
            {changeImpact?.hasImpact ? (
              <ChangeImpactAlert impact={changeImpact} onDismiss={() => setChangeImpact(null)} />
            ) : null}
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

      {showAnalysisPanel && previewFile ? (
        <>
          <div className="analysis-drawer-mask open" onClick={closeFilePreview} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Escape") closeFilePreview(); }} aria-label="关闭" />
          <aside className="panel preview-panel context-panel artifact-preview-panel analysis-drawer open" style={{ width: `min(${artifactDrawerWidth}px, 100vw)` }}>
            <article className="analysis-drawer-inner" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="artifact-drawer-resize-handle" onPointerDown={handleArtifactDrawerResizePointerDown} />
              <div className="panel-head analysis-drawer-head">
                <div>
                  <h2>{previewFile.name}</h2>
                  <div className="file-preview-meta">
                    {previewFile.size > 0 ? <span className="upload-file-size">{previewFile.size < 1024 ? `${previewFile.size} B` : previewFile.size < 1048576 ? `${(previewFile.size / 1024).toFixed(1)} KB` : `${(previewFile.size / 1048576).toFixed(1)} MB`}</span> : null}
                    <span className="upload-file-chip">{previewFile.type || "文件"}</span>
                  </div>
                </div>
                <div className="chat-tools">
                  {(previewFile.content || previewFile.dataUrl) ? (
                    <button type="button" className="btn ghost mini" onClick={() => downloadSingleFile(previewFile)}>下载</button>
                  ) : null}
                  <button type="button" className="icon-btn" aria-label="关闭预览" onClick={closeFilePreview}>✕</button>
                </div>
              </div>
              <div className={`preview-scroll file-preview-body${/\.html?$/i.test(previewFile.name) && previewFile.content ? " file-preview-body-iframe" : ""}`}>
                {previewFile.dataUrl?.startsWith("data:image/") ? (
                  <img src={previewFile.dataUrl} alt={previewFile.name} className="file-preview-image" />
                ) : /\.html?$/i.test(previewFile.name) && previewFile.content ? (
                  <iframe
                    title={previewFile.name}
                    className="file-preview-iframe"
                    sandbox="allow-scripts"
                    srcDoc={inlineHtmlResources(previewFile.content, previewSiblingFiles)}
                  />
                ) : previewFile.content ? (
                  <pre className="file-preview-text">{previewFile.content}</pre>
                ) : (
                  <p className="file-preview-empty">该文件无法预览</p>
                )}
              </div>
            </article>
          </aside>
        </>
      ) : showAnalysisPanel ? (
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
          coachGuidance={coachGuidance}
          businessConfirmation={businessConfirmation}
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
          showInteractionEntry={showInteractionEntry}
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
