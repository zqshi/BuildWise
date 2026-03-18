import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { OpsTriageTemplate } from "../../domain/workspace/platformTypes";
import { AnalysisDrawerContent } from "./AnalysisDrawerContent";
import { InteractionDrawerContent } from "./InteractionDrawerContent";
import { deleteOpsTriageTemplate, upsertOpsTriageTemplate } from "../../app/workspaceApi";
import { useDrawerResize } from "./useDrawerResize";
import { useOpsTemplates } from "./useOpsTemplates";
import { usePrototypeInteraction } from "./usePrototypeInteraction";
import {
  buildIterationChatDisplayItems,
  compactArtifactCardSummary,
  parseArtifactReferenceMessage,
  shouldSuppressArtifactTextMessage
} from "../../app/workspaceChatMessagePresentation";
import { buildAnalysisArtifactPreview, parseAnalysisArtifactSections } from "./analysisArtifactPresenter";
import { ArtifactCodeViewer, ArtifactTextEditor } from "./ArtifactEditorWidgets";
import {
  buildArtifactCommitSummary,
  buildArtifactRevisionPrompt,
  extractArtifactPrototypeHtml,
  resolveArtifactActionErrorMessage,
  shouldCloseDrawerAfterRevisionRequest,
  stripRichTextToPlainText
} from "./artifactEditorModel";
import { ArtifactImpactPanel } from "./IterationChangeIntelligencePanel";
import type {
  ArtifactPreviewKind,
  PrototypeElement,
  PrototypeChangeHistoryItem,
  HtmlPreviewInteractionPayload,
  ImageSelectionRegion,
  HtmlPreviewHistoryItem,
  IterationWorkspacePanelProps,
  IterationMessage,
  IterationStatus,
  IterationVisualEditResponse,
  IterationArtifactStage,
} from "./iterationWorkspacePanelTypes";
import {
  resolveArtifactPreviewKind,
  getInteractionDrawerWidthBounds,
  getArtifactDrawerWidthBounds,
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
  onUpdateClarificationDraft,
  onConfirmIterationAnalysis,
  onUpdateIterationBoundary,
  onUpdateTestMatrixExecution,
  onGenerateTestArtifacts,
  onRefreshReleaseReview,
  onSaveArtifactDraft,
  onCommitArtifact,
  onConfirmArtifact,
  onAppendArtifactToChat,
  onTransitionArtifactStage,
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
  // ── Extracted hooks (order-independent) ──
  const {
    interactionDrawerWidth, setInteractionDrawerWidth,
    artifactDrawerWidth, setArtifactDrawerWidth,
    handleInteractionDrawerResizePointerDown,
    handleArtifactDrawerResizePointerDown,
  } = useDrawerResize();
  const { opsTemplates, setOpsTemplates, reloadOpsTemplates, buildOpsCommandTemplates } = useOpsTemplates(currentIteration?.projectId);

  const [onlyHighValue, setOnlyHighValue] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const analysisScrollRef = useRef<HTMLDivElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTriggerRef = useRef<HTMLDivElement | null>(null);
  const folderPickerAttrs = { webkitdirectory: "", directory: "" } as unknown as Record<string, string>;
  const [resolvedQuestions, setResolvedQuestions] = useState<string[]>([]);
  const [boundaryRequirementRefsText, setBoundaryRequirementRefsText] = useState("");
  const [boundaryComponentRefsText, setBoundaryComponentRefsText] = useState("");
  const [boundaryCodePathsText, setBoundaryCodePathsText] = useState("");
  const [boundaryNote, setBoundaryNote] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [changeControlBusy, setChangeControlBusy] = useState(false);
  const [changeControlNotice, setChangeControlNotice] = useState("");
  const [opsCopyNotice, setOpsCopyNotice] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
  const [templateCategory, setTemplateCategory] = useState("custom");
  const [templateKeywordsText, setTemplateKeywordsText] = useState("");
  const [templateCommandsText, setTemplateCommandsText] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [testMatrixStatusMap, setTestMatrixStatusMap] = useState<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>({});
  const [testMatrixNoteMap, setTestMatrixNoteMap] = useState<Record<string, string>>({});
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [interactionEditMode, setInteractionEditMode] = useState(false);
  // ── Extracted hook (depends on interactionEditMode) ──
  const {
    selectedImagePoint, setSelectedImagePoint,
    selectedImageRegion, setSelectedImageRegion,
    dragImageRegion, setDragImageRegion,
    imageWrapRef,
    toPercentPoint,
    handleImagePointerDown, handleImagePointerMove,
    handleImagePointerUp, handleImagePointerCancel,
    finalizeImageSelection,
    applyPrototypeInstruction: applyPrototypeInstructionHook,
  } = usePrototypeInteraction(interactionEditMode);
  const [selectedHtmlPreviewPath, setSelectedHtmlPreviewPath] = useState("");
  const [selectedPrototypeElementId, setSelectedPrototypeElementId] = useState("page-title");
  const [prototypeElements, setPrototypeElements] = useState<PrototypeElement[]>(defaultPrototypeElements);
  const [prototypeLastPlan, setPrototypeLastPlan] = useState<string[]>([]);
  const [prototypeHistory, setPrototypeHistory] = useState<PrototypeChangeHistoryItem[]>([]);
  const [selectedImagePreviewPath, setSelectedImagePreviewPath] = useState("");
  const [interactionInstruction, setInteractionInstruction] = useState("");
  const [artifactEditorValue, setArtifactEditorValue] = useState("");
  const [artifactEditorDirty, setArtifactEditorDirty] = useState(false);
  const [artifactEditorBusy, setArtifactEditorBusy] = useState(false);
  const [artifactEditorMode, setArtifactEditorMode] = useState<"view" | "edit">("view");
  const [hoveredHtmlElement, setHoveredHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [selectedHtmlElement, setSelectedHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [htmlPreviewHistory, setHtmlPreviewHistory] = useState<HtmlPreviewHistoryItem[]>([]);
  const htmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const artifactHtmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const chatComposerInputRef = useRef<HTMLInputElement | null>(null);
  const scopeInCount = contextData?.scope.inScope.length ?? 0;
  const scopeOutCount = contextData?.scope.outOfScope.length ?? 0;
  const acceptanceCount = contextData?.scope.acceptanceCriteria.length ?? 0;
  const getRoleLabel = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "BuildWise AI" : "系统");
  const getRoleAvatar = (role: IterationMessage["role"]) => (role === "user" ? "我" : role === "assistant" ? "AI" : "系");
  const getMsgKind = (msg: IterationMessage) => {
    if (msg.role === "system" && (msg.content.startsWith("已上传附件") || msg.content.startsWith("已上传文件夹"))) {
      return "event-upload";
    }
    if (
      msg.role === "assistant" &&
      (msg.content.includes("附件已完成大模型分析") || msg.content.includes("查看分析报告"))
    ) {
      return "event-analysis";
    }
    return "";
  };
  const getMsgTheme = (msg: IterationMessage) => {
    const content = msg.content.toLowerCase();
    if (content.includes("风险") || content.includes("阻塞")) {
      return "theme-risk";
    }
    if (content.includes("完成") || content.includes("通过") || content.includes("success")) {
      return "theme-success";
    }
    if (content.includes("分析") || content.includes("差异") || content.includes("附件")) {
      return "theme-analysis";
    }
    return "theme-default";
  };
  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const displayMessages = useMemo(() => buildIterationChatDisplayItems(chatMessages), [chatMessages]);
  const statusLabelMap: Record<IterationStatus, string> = {
    planned: "规划中",
    "in-progress": "进行中",
    review: "评审中",
    blocked: "阻塞中",
    completed: "已完成"
  };
  const renderStatusLabel = (status: IterationStatus) => statusLabelMap[status] ?? status;
  const diffLocations = analysisReport?.diffLocations ?? [];
  const diffAdded = analysisReport?.versionDiff?.added ?? [];
  const diffChanged = analysisReport?.versionDiff?.changed ?? [];
  const diffRemoved = analysisReport?.versionDiff?.removed ?? [];
  const hasBaselineComparison = Boolean(
    analysisReport?.versionDiff?.baselineIterationName && analysisReport?.versionDiff?.baselineIterationName !== analysisReport?.iterationName
  );
  const showAdvancedReportSections = Boolean(analysisReport);
  const allowedTransitions = stateMachine?.allowedTransitions ?? [];
  const transitionHistory = stateMachine?.transitionHistory ?? [];
  const hasStateMachineActions = allowedTransitions.length > 0;
  const hasAnalysisEntryInChat = chatMessages.some((msg) => getMsgKind(msg) === "event-analysis");
  const lastUploadMessageId = [...chatMessages].reverse().find((msg) => getMsgKind(msg) === "event-upload")?.id;
  const canOpenAnalysisPanel = !isAnalyzingAttachment && (Boolean(analysisReport) || hasAnalysisEntryInChat);
  const materialRisks = (analysisReport?.risks || []).filter((item) => !item.includes("暂无显式风险"));
  const materialSuggestions = (analysisReport?.suggestions || []).filter(
    (item) => !item.includes("当前澄清问题已收敛") && !item.includes("暂无结构化差异")
  );
  const traceabilityMap = analysisReport?.traceabilityMap;
  const executableConstraints = analysisReport?.executableConstraints;
  const versionDiffDetailed = analysisReport?.versionDiffDetailed;
  const releaseReview = analysisReport?.releaseReview;
  const domainKnowledge = analysisReport?.domainKnowledge;
  const opsTriage = analysisReport?.opsTriage;
  const qualityArtifacts = analysisReport?.qualityArtifacts;
  const prioritizedFindings = analysisReport?.prioritizedFindings || [];
  const visiblePrioritizedFindings = onlyHighValue
    ? prioritizedFindings.filter((item) => item.priority === "P0" || item.priority === "P1")
    : prioritizedFindings;
  const clarificationQuestions = currentIteration?.changeControl?.clarificationQuestions ?? analysisReport?.clarificationQuestions ?? [];
  const pendingHumanConfirmation = currentIteration?.changeControl?.pendingHumanConfirmation ?? false;
  const generatedTestMatrix = currentIteration?.changeControl?.generatedTestMatrix ?? [];
  const matrixSummary = (() => {
    const total = generatedTestMatrix.length;
    const statuses = generatedTestMatrix.map((item) => testMatrixStatusMap[item.caseId] || item.executionStatus);
    const passed = statuses.filter((status) => status === "passed").length;
    const failed = statuses.filter((status) => status === "failed").length;
    const blocked = statuses.filter((status) => status === "blocked").length;
    const skipped = statuses.filter((status) => status === "skipped").length;
    const executed = passed + failed + blocked + skipped;
    const coverage = total === 0 ? 100 : Math.round((executed / total) * 100);
    const passRate = executed === 0 ? (total === 0 ? 100 : 0) : Math.round((passed / executed) * 100);
    return { total, executed, passed, failed, blocked, skipped, coverage, passRate };
  })();
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
  const htmlPrototypePreviews = uploadedFile?.htmlPreviews ?? [];
  const htmlPreviewPathsKey = htmlPrototypePreviews.map((item) => item.path).join("|");
  const imagePrototypePreviews = uploadedFile?.imagePreviews ?? [];
  const selectedHtmlPreview =
    htmlPrototypePreviews.find((item) => item.path === selectedHtmlPreviewPath) || htmlPrototypePreviews[0] || null;
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
  const reportPendingConfirmation = Boolean(currentIteration?.changeControl?.pendingHumanConfirmation);
  const reportConfirmedAt = currentIteration?.changeControl?.confirmedAt || "";
  const confirmedUnderstanding = (currentIteration?.changeControl?.lastClarificationNote || "").trim();
  const artifactItems = currentIteration?.changeControl?.artifactWorkflow?.items || [];
  const activeArtifactStage = currentIteration?.changeControl?.artifactWorkflow?.activeStage || "clarification";
  const [analysisDrawerArtifactId, setAnalysisDrawerArtifactId] = useState<string | null>(null);
  const artifactMap = useMemo(() => new Map(artifactItems.map((item) => [item.id, item])), [artifactItems]);
  const selectedDrawerArtifact = analysisDrawerArtifactId ? artifactMap.get(analysisDrawerArtifactId) || null : null;
  const selectedArtifactKind = selectedDrawerArtifact ? resolveArtifactPreviewKind(selectedDrawerArtifact.id) : null;
  const artifactDraftContent = selectedDrawerArtifact?.draft?.content || "";
  const editableTextArtifactKinds: ArtifactPreviewKind[] = [
    "product-requirements-doc",
    "design-spec",
    "technical-architecture",
    "document"
  ];
  const isEditableTextArtifact = selectedArtifactKind ? editableTextArtifactKinds.includes(selectedArtifactKind) : false;
  const artifactEditorSource = isEditableTextArtifact ? artifactDraftContent || selectedDrawerArtifact?.summary || "" : artifactDraftContent;
  const extractedArtifactPrototypeHtml = useMemo(() => extractArtifactPrototypeHtml(artifactDraftContent), [artifactDraftContent]);
  const selectedArtifactHtmlContent =
    selectedArtifactKind === "html-prototype" ? (extractedArtifactPrototypeHtml || selectedHtmlPreview?.content || "") : "";
  const selectedArtifactHtmlPreview = useMemo(
    () => (selectedArtifactKind === "html-prototype" && selectedArtifactHtmlContent ? instrumentHtmlPreview(selectedArtifactHtmlContent, interactionEditMode) : ""),
    [selectedArtifactKind, selectedArtifactHtmlContent, interactionEditMode]
  );
  const analysisDraftSections = useMemo(
    () => (selectedArtifactKind === "analysis-report" ? parseAnalysisArtifactSections(artifactDraftContent) : []),
    [selectedArtifactKind, artifactDraftContent]
  );
  useEffect(() => {
    const boundary = currentIteration?.changeControl?.boundary;
    setResolvedQuestions(currentIteration?.changeControl?.clarificationDraftResolvedQuestions ?? []);
    setBoundaryRequirementRefsText((boundary?.requirementRefs ?? []).join("\n"));
    setBoundaryComponentRefsText((boundary?.componentRefs ?? []).join("\n"));
    setBoundaryCodePathsText((boundary?.codePaths ?? []).join("\n"));
    setBoundaryNote(boundary?.note ?? "");
    setConfirmNote(currentIteration?.changeControl?.lastClarificationNote ?? "");
  }, [currentIteration?.id, currentIteration?.changeControl?.boundary?.updatedAt, currentIteration?.changeControl?.clarificationDraftUpdatedAt]);

  useEffect(() => {
    setArtifactEditorValue(artifactEditorSource);
    setArtifactEditorDirty(false);
    setArtifactEditorMode("view");
  }, [selectedDrawerArtifact?.id, artifactEditorSource]);

  useEffect(() => {
    setAnalysisDrawerArtifactId(null);
  }, [currentIteration?.id]);


  useEffect(() => {
    const matrix = currentIteration?.changeControl?.generatedTestMatrix ?? [];
    const nextStatusMap: Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped"> = {};
    const nextNoteMap: Record<string, string> = {};
    for (const item of matrix) {
      nextStatusMap[item.caseId] = item.executionStatus;
      nextNoteMap[item.caseId] = item.executionNote || "";
    }
    setTestMatrixStatusMap(nextStatusMap);
    setTestMatrixNoteMap(nextNoteMap);
  }, [currentIteration?.id, currentIteration?.changeControl?.generatedTestMatrixUpdatedAt, currentIteration?.changeControl?.testMatrixExecutionUpdatedAt]);

  useEffect(() => {
    if (!showUploadMenu) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!uploadTriggerRef.current || !target) {
        setShowUploadMenu(false);
        return;
      }
      if (!uploadTriggerRef.current.contains(target)) {
        setShowUploadMenu(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [showUploadMenu]);

  useEffect(() => {
    const previews = uploadedFile?.htmlPreviews ?? [];
    if (previews.length === 0) {
      setSelectedHtmlPreviewPath("");
      setSelectedHtmlElement(null);
      setHoveredHtmlElement(null);
      setHtmlPreviewHistory([]);
      return;
    }
    setSelectedHtmlPreviewPath((prev) => (previews.some((item) => item.path === prev) ? prev : previews[0].path));
  }, [uploadedFile?.iterationId, htmlPreviewPathsKey]);

  useEffect(() => {
    if (interactionEditMode) {
      return;
    }
    setSelectedHtmlElement(null);
    setHoveredHtmlElement(null);
    setSelectedImagePoint(null);
    setSelectedImageRegion(null);
    setDragImageRegion(null);
  }, [interactionEditMode]);

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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | {
            source?: string;
            type?: "hover" | "select";
            payload?: HtmlPreviewInteractionPayload;
          }
        | null
        | undefined;
      if (!data || data.source !== "buildwise-html-preview") {
        return;
      }
      if (!interactionEditMode || !data.payload) {
        return;
      }
      if (data.type === "hover") {
        setHoveredHtmlElement(data.payload as HtmlPreviewInteractionPayload);
        return;
      }
      if (data.type === "select") {
        setSelectedHtmlElement(data.payload as HtmlPreviewInteractionPayload);
        setHoveredHtmlElement(data.payload as HtmlPreviewInteractionPayload);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [interactionEditMode]);

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

  const parseLines = (value: string) =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

  const copyText = async (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    if (typeof document === "undefined") {
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  const resolveGuidanceText = (content: string) => {
    if (content.startsWith("操作建议JSON:")) {
      const raw = content.replace(/^操作建议JSON:/, "").trim();
      try {
        const parsed = JSON.parse(raw) as {
          uploadRecommended?: boolean;
          actions?: string[];
          checklist?: string[];
          prerequisites?: string[];
        };
        const parts: string[] = [];
        if (parsed.uploadRecommended) {
          parts.push("建议先上传本轮相关材料。");
        }
        const actions = Array.isArray(parsed.actions)
          ? parsed.actions.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 3)
          : [];
        if (actions.length > 0) {
          parts.push(`下一步可执行：${actions.join("；")}。`);
        }
        const checklist = Array.isArray(parsed.checklist)
          ? parsed.checklist.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 2)
          : [];
        if (checklist.length > 0) {
          parts.push(`优先确认：${checklist.join("；")}。`);
        }
        const prerequisites = Array.isArray(parsed.prerequisites)
          ? parsed.prerequisites.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 2)
          : [];
        if (prerequisites.length > 0) {
          parts.push(`前置条件：${prerequisites.join("；")}。`);
        }
        return parts.length > 0 ? `继续推进建议：${parts.join("")}` : "继续推进建议：请在当前会话中明确下一步目标与边界。";
      } catch {
        return "继续推进建议：请在当前会话中明确下一步目标与边界。";
      }
    }
    if (content.startsWith("操作建议：")) {
      const items = content
        .replace(/^操作建议：/, "")
        .split("；")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4);
      return items.length > 0 ? `补充建议：${items.join("；")}。` : "补充建议：请继续在会话中确认下一步。";
    }
    return "";
  };

  const resolveDeliverableCardData = (content: string) => {
    const deliverable = parseArtifactReferenceMessage(content);
    if (!deliverable) {
      return null;
    }
    const matchedArtifact = artifactItems.find((item) => item.title === deliverable.title);
    if (!matchedArtifact) {
      return deliverable;
    }
    const matchedKind = resolveArtifactPreviewKind(matchedArtifact.id);
    if (matchedKind !== "analysis-report") {
      return {
        ...deliverable,
        summary: compactArtifactCardSummary(matchedArtifact.summary || deliverable.summary, deliverable.summary),
        evidence: deliverable.evidence.length > 0 ? deliverable.evidence : matchedArtifact.evidence || []
      };
    }
    const preview = buildAnalysisArtifactPreview(matchedArtifact.draft?.content || "");
    return {
      ...deliverable,
      summary: compactArtifactCardSummary(preview.summary || matchedArtifact.summary || deliverable.summary, deliverable.summary),
      evidence: preview.evidence.length > 0 ? preview.evidence : deliverable.evidence
    };
  };

  const findPreferredArtifactForStage = (stage: IterationArtifactStage) =>
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


  const applyActionsToHtmlContent = (source: string, selector: string, result: IterationVisualEditResponse) => {
    if (!source.trim() || result.actions.length === 0) {
      return source;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(source, "text/html");
      const target = selector ? doc.querySelector(selector) : null;
      if (!target) {
        return source;
      }
      for (const action of result.actions) {
        if (action.op === "set-text") {
          target.textContent = action.value;
          continue;
        }
        if (action.op === "set-style" || action.op === "resize") {
          if (action.property) {
            (target as HTMLElement).style.setProperty(
              action.property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`),
              action.value
            );
          }
          continue;
        }
        if (action.op === "toggle-visibility") {
          (target as HTMLElement).style.display = action.value === "hidden" ? "none" : "";
        }
      }
      return doc.documentElement.outerHTML;
    } catch {
      return source;
    }
  };

  const getActiveHtmlPreviewWindow = () => {
    if (showAnalysisPanel && selectedArtifactKind === "html-prototype") {
      return artifactHtmlPreviewFrameRef.current?.contentWindow || null;
    }
    return htmlPreviewFrameRef.current?.contentWindow || null;
  };

  const applyHtmlActionsToPreview = (selector: string, result: IterationVisualEditResponse) => {
    const frameWindow = getActiveHtmlPreviewWindow();
    if (!frameWindow || result.actions.length === 0) {
      return;
    }
    frameWindow.postMessage(
      {
        source: "buildwise-visual-edit-host",
        type: "apply-actions",
        payload: {
          selector,
          actions: result.actions
        }
      },
      "*"
    );
  };

  const handleUndoHtmlPreview = () => {
    const latest = htmlPreviewHistory[0];
    if (!latest) {
      return;
    }
    const frameWindow = getActiveHtmlPreviewWindow();
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
      "*"
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
        applyHtmlActionsToPreview(selectedHtmlElement.selector, result);
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

  const handleSaveArtifactEditor = async () => {
    if (!selectedDrawerArtifact || !artifactEditorDirty || artifactEditorBusy) {
      return;
    }
    setArtifactEditorBusy(true);
    try {
      await onSaveArtifactDraft(selectedDrawerArtifact.id, {
        content: artifactEditorValue,
        actor: "OpenClaw Agent"
      });
      setArtifactEditorDirty(false);
      setChangeControlNotice("交付物正文已保存。");
    } catch (error) {
      setChangeControlNotice(resolveArtifactActionErrorMessage(error, "交付物正文保存失败，请稍后重试。"));
    } finally {
      setArtifactEditorBusy(false);
    }
  };

  const handleSubmitArtifactForReview = async () => {
    if (!selectedDrawerArtifact || artifactEditorBusy) {
      return;
    }
    setArtifactEditorBusy(true);
    try {
      if (artifactEditorDirty) {
        await onSaveArtifactDraft(selectedDrawerArtifact.id, {
          content: artifactEditorValue,
          actor: "OpenClaw Agent"
        });
      }
      await onCommitArtifact(selectedDrawerArtifact.id, {
        actor: "OpenClaw Agent",
        summary: buildArtifactCommitSummary(artifactEditorValue || selectedDrawerArtifact.summary || "", selectedDrawerArtifact.summary),
        evidence: selectedDrawerArtifact.evidence,
        source: selectedDrawerArtifact.source
      });
      setArtifactEditorDirty(false);
      setArtifactEditorMode("view");
      setChangeControlNotice("交付物已提交，等待你确认。");
    } catch (error) {
      setChangeControlNotice(resolveArtifactActionErrorMessage(error, "交付物提交失败，请稍后重试。"));
    } finally {
      setArtifactEditorBusy(false);
    }
  };

  const handleConfirmSelectedArtifact = async () => {
    if (!selectedDrawerArtifact || artifactEditorBusy) {
      return;
    }
    setArtifactEditorBusy(true);
    try {
      await onConfirmArtifact(selectedDrawerArtifact.id, {
        actor: "项目负责人",
        passed: true,
        note: selectedDrawerArtifact.summary
      });
      setChangeControlNotice("交付物已确认通过。");
    } catch (error) {
      setChangeControlNotice(resolveArtifactActionErrorMessage(error, "交付物确认失败，请稍后重试。"));
    } finally {
      setArtifactEditorBusy(false);
    }
  };

  const handleRequestArtifactRevision = () => {
    if (!selectedDrawerArtifact) {
      return;
    }
    onChatInputChange(buildArtifactRevisionPrompt(selectedDrawerArtifact.title, chatInput));
    if (shouldCloseDrawerAfterRevisionRequest()) {
      onCloseAnalysisPanel();
    } else {
      setAnalysisDrawerArtifactId(selectedDrawerArtifact.id);
      onOpenAnalysisPanel();
    }
    setArtifactEditorMode("view");
    setChangeControlNotice("已带入对话输入框，可直接继续补充修改意见。");
    requestAnimationFrame(() => {
      chatComposerInputRef.current?.focus();
      chatComposerInputRef.current?.setSelectionRange(chatComposerInputRef.current.value.length, chatComposerInputRef.current.value.length);
    });
  };

  const openInteractionPanel = () => {
    onCloseAnalysisPanel();
    setShowInteractionPanel(true);
  };

  const selectedArtifactAwaitingConfirmation = Boolean(
    selectedDrawerArtifact && selectedDrawerArtifact.outputVersion > 0 && selectedDrawerArtifact.gateStatus !== "passed"
  );
  const canEditSelectedTextArtifact = isEditableTextArtifact && selectedDrawerArtifact?.editCapability !== "none";

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
        <div className="iteration-status-strip">
          <span className={`status-pill ${stateMachine?.currentStatus || currentIteration?.status || "planned"}`}>
            {renderStatusLabel(stateMachine?.currentStatus || currentIteration?.status || "planned")}
          </span>
          <span>继承：{contextData?.previous ? contextData.previous.name : "首个版本"}</span>
          <span>范围 in/out：{scopeInCount}/{scopeOutCount}</span>
          <span>验收：{acceptanceCount} 项</span>
          {hasStateMachineActions ? (
            <div className="chat-tools">
              {allowedTransitions.slice(0, 2).map((status) => (
                <button key={status} type="button" className="btn ghost mini" onClick={() => onTransitionState(status)}>
                  流转到 {renderStatusLabel(status)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="iteration-workbench-grid">
          <div className="iteration-chat-main">
            <div
              className={`chat-body ${dragOver ? "drop-active" : ""}`}
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
              {chatMessages.length === 0 ? (
                <div className="empty-state">暂无消息，输入需求后开始沟通。</div>
              ) : (
                displayMessages.map((item) => {
                  const msg = item.leadMessage;
                  const cardMessage = item.cardMessage;
                  const deliverable = cardMessage ? resolveDeliverableCardData(cardMessage.content) : null;
                  const textMessage = item.textMessage;
                  const resolvedCardSummary = deliverable ? compactArtifactCardSummary(deliverable.summary || "") : "";
                  const rawTextContent = textMessage ? resolveGuidanceText(textMessage.content) || textMessage.content : "";
                  const shouldHideTextContent =
                    Boolean(textMessage && deliverable && shouldSuppressArtifactTextMessage(rawTextContent, resolvedCardSummary, deliverable.title));
                  const textContent = shouldHideTextContent ? "" : rawTextContent;
                  return (
                  <div key={item.key} className={`msg-row msg-row-${msg.role}`}>
                    {msg.role !== "user" ? (
                      <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                        {getRoleAvatar(msg.role)}
                      </div>
                    ) : null}
                    <div className={`msg msg-${msg.role} ${getMsgKind(msg)} ${getMsgTheme(msg)}`}>
                      <div className="msg-meta">
                        <span>{getRoleLabel(msg.role)}</span>
                        <time dateTime={msg.createdAt}>{formatTime(msg.createdAt)}</time>
                      </div>
                      {textMessage && textContent ? <p className={cardMessage ? "msg-mixed-copy" : undefined}>{textContent}</p> : null}
                      {deliverable ? (
                        <div className="deliverable-msg-card">
                          <div className="deliverable-msg-head">
                            <strong>{deliverable.title}</strong>
                            <span className="hint">待你确认</span>
                          </div>
                          {resolvedCardSummary ? <p>{resolvedCardSummary}</p> : null}
                          {deliverable.evidence.length > 0 ? (
                            <ul className="deliverable-plain-list">
                              {deliverable.evidence.map((entry) => (
                                <li key={entry}>{entry}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="msg-inline-actions">
                            <button type="button" className="btn ghost mini" onClick={() => openArtifactPreviewByTitle(deliverable.title)}>
                              查看交付物
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {!textMessage && !deliverable ? <p>{resolveGuidanceText(msg.content) || msg.content}</p> : null}
                      {getMsgKind(msg) === "event-upload" && msg.id === lastUploadMessageId ? (
                        <div className="msg-inline-actions">
                          {canOpenAnalysisPanel ? (
                            <button type="button" className="btn ghost mini attachment-report-entry" onClick={openAnalysisDrawer}>
                              查看分析报告
                            </button>
                          ) : null}
                          {showInteractionEntry ? (
                            <button type="button" className="btn ghost mini" onClick={openInteractionPanel}>
                              交互界面
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {msg.role === "user" ? (
                      <div className={`msg-avatar avatar-${msg.role}`} aria-hidden="true">
                        {getRoleAvatar(msg.role)}
                      </div>
                    ) : null}
                  </div>
                )})
              )}
            </div>
            {uploadAnalysisProgress ? (
              <div className={`upload-analysis-status stage-${uploadAnalysisProgress.stage}`} role="status" aria-live="polite">
                <div className="upload-analysis-status-head">
                  <strong>{uploadAnalysisProgress.label}</strong>
                  <span>{Math.max(0, Math.min(100, uploadAnalysisProgress.percent))}%</span>
                </div>
                <p>{uploadAnalysisProgress.detail}</p>
                <div className="progress-bar">
                  <div className="progress-value" style={{ width: `${Math.max(0, Math.min(100, uploadAnalysisProgress.percent))}%` }} />
                </div>
              </div>
            ) : null}
            {lastUploadFailed ? (
              <div className="chat-tools upload-tip">
                <button type="button" className="btn ghost mini" onClick={() => void onRetryUpload()}>
                  重新尝试上传
                </button>
              </div>
            ) : null}
            <div className="chat-input-row">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden-input"
                onChange={onUpload}
                multiple
              />
              <input
                ref={folderInputRef}
                type="file"
                className="hidden-input"
                multiple
                {...folderPickerAttrs}
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  void onUploadFiles(files);
                  event.target.value = "";
                }}
              />
              <div className="upload-trigger" ref={uploadTriggerRef}>
                <button
                  type="button"
                  className="icon-btn upload-icon-btn"
                  onClick={() => setShowUploadMenu((prev) => !prev)}
                  disabled={!currentIteration || isAnalyzingAttachment}
                  aria-label={isAnalyzingAttachment ? "附件分析中" : "发送附件"}
                  title={isAnalyzingAttachment ? "分析中..." : "发送附件/文件夹（支持拖拽）"}
                >
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M6.2 8.6L3.9 10.9C3 11.8 3 13.2 3.9 14.1C4.8 15 6.2 15 7.1 14.1L11.9 9.3C13.1 8.1 13.1 6.2 11.9 5C10.7 3.8 8.8 3.8 7.6 5L2.8 9.8"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {showUploadMenu ? (
                  <div className="upload-menu" role="menu">
                    <button
                      type="button"
                      className="btn ghost mini"
                      onClick={() => {
                        setShowUploadMenu(false);
                        onUploadClick();
                      }}
                    >
                      选择文件
                    </button>
                    <button
                      type="button"
                      className="btn ghost mini"
                      onClick={() => {
                        setShowUploadMenu(false);
                        folderInputRef.current?.click();
                      }}
                    >
                      选择文件夹
                    </button>
                  </div>
                ) : null}
              </div>
              <input
                ref={chatComposerInputRef}
                value={chatInput}
                onChange={(event) => onChatInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleComposedSend();
                  }
                }}
                onFocus={() => setShowUploadMenu(false)}
                placeholder="输入需求或指令，例如：完成: 接口联调"
                aria-label="需求输入框"
              />
              <button type="button" className="btn primary" onClick={handleComposedSend} disabled={!chatInput.trim()}>
                发送
              </button>
            </div>
            {chatSendStatus === "sending" || chatSendStatus === "failed" ? (
              <p className={`chat-send-status status-${chatSendStatus}`}>
                {chatSendStatus === "sending" ? "发送中..." : "发送失败，请重试"}
              </p>
            ) : null}
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
