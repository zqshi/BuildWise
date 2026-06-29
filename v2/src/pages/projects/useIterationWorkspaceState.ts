import { useEffect, useMemo, useRef, useState } from "react";
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
import type { UploadFileEntry } from "./UploadFileCard";
import type {
  PrototypeElement,
  PrototypeChangeHistoryItem,
  IterationWorkspacePanelProps,
} from "./iterationWorkspacePanelTypes";
import { instrumentHtmlPreview } from "./iterationWorkspacePanelUtils";
import {
  deriveChatProcessingState,
  buildConfirmAnalysisHandler,
  computeLlmBase,
  mapPrototypeItems,
  buildImageSelectionSummary,
  buildPrototypeTree
} from "./iterationWorkspaceStateHelpers";

const DEFAULT_PROTOTYPE_ELEMENTS: PrototypeElement[] = [
  { id: "page-title", page: "首页", component: "Header", label: "项目工作台", background: "#0ea5e9", color: "#ffffff", visible: true, emphasized: true, width: 460, height: 52 },
  { id: "search-input", page: "首页", component: "Header", label: "搜索项目、需求、任务", background: "#ffffff", color: "#334155", visible: true, emphasized: false, width: 460, height: 42 },
  { id: "nav-tab", page: "首页", component: "Tabs", label: "迭代 / 需求 / 发布", background: "#f1f5f9", color: "#0f172a", visible: true, emphasized: false, width: 460, height: 44 },
  { id: "primary-cta", page: "首页", component: "Actions", label: "创建迭代", background: "#2563eb", color: "#ffffff", visible: true, emphasized: true, width: 220, height: 44 },
  { id: "task-card", page: "首页", component: "Cards", label: "卡片：待澄清问题", background: "#ffffff", color: "#0f172a", visible: true, emphasized: false, width: 460, height: 92 },
];

/** Compose all sub-hooks and return unified workspace state. */
export function useIterationWorkspaceState(props: IterationWorkspacePanelProps) {
  const external = useExternalHooks(props);
  const local = useLocalState();
  const derived = useDerivedData(props, external, local);
  const handlers = useWorkspaceHandlers(props, external, local, derived);
  return buildReturnValue(external, local, derived, handlers);
}

// ── Sub-hook: external/library hooks ──

function useExternalHooks(props: IterationWorkspacePanelProps) {
  const drawer = useDrawerResize();
  const ops = useOpsTemplates(props.currentIteration?.projectId);
  const ccForm = useChangeControlForm(props.currentIteration);
  const tmForm = useTestMatrixForm(props.currentIteration);
  const opsForm = useOpsTemplateForm();
  return { drawer, ops, ccForm, tmForm, opsForm };
}

type ExternalHooks = ReturnType<typeof useExternalHooks>;

// ── Sub-hook: local state declarations ──

function useLocalState() {
  const [onlyHighValue, setOnlyHighValue] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const [chatLlmPercent, setChatLlmPercent] = useState(0);
  const [showInteractionPanel, setShowInteractionPanel] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadFileEntry | null>(null);
  const [previewSiblingFiles, setPreviewSiblingFiles] = useState<UploadFileEntry[]>([]);
  const [interactionEditMode, setInteractionEditMode] = useState(false);
  const [selectedPrototypeElementId, setSelectedPrototypeElementId] = useState("page-title");
  const [prototypeElements, setPrototypeElements] = useState<PrototypeElement[]>(DEFAULT_PROTOTYPE_ELEMENTS);
  const [prototypeLastPlan, setPrototypeLastPlan] = useState<string[]>([]);
  const [prototypeHistory, setPrototypeHistory] = useState<PrototypeChangeHistoryItem[]>([]);
  const [selectedImagePreviewPath, setSelectedImagePreviewPath] = useState("");
  const chatComposerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const analysisScrollRef = useRef<HTMLDivElement | null>(null);

  return {
    onlyHighValue, setOnlyHighValue,
    dragOver, setDragOver,
    chatBodyRef,
    chatLlmPercent, setChatLlmPercent,
    showInteractionPanel, setShowInteractionPanel,
    previewFile, setPreviewFile,
    previewSiblingFiles, setPreviewSiblingFiles,
    interactionEditMode, setInteractionEditMode,
    selectedPrototypeElementId, setSelectedPrototypeElementId,
    prototypeElements, setPrototypeElements,
    prototypeLastPlan, setPrototypeLastPlan,
    prototypeHistory, setPrototypeHistory,
    selectedImagePreviewPath, setSelectedImagePreviewPath,
    chatComposerInputRef,
    analysisScrollRef,
  };
}

type LocalState = ReturnType<typeof useLocalState>;

// ── Sub-hook: derived data + side effects ──

function useDerivedData(props: IterationWorkspacePanelProps, ext: ExternalHooks, local: LocalState) {
  const { uploadedFile, chatMessages, analysisReport, isAnalyzingAttachment } = props;
  const { interactionEditMode, selectedImagePreviewPath, selectedPrototypeElementId, prototypeElements } = local;
  const chatState = deriveChatProcessingState(props);

  useChatLlmProgressEffect(props.chatSendStatus, chatState.isChatProcessing, chatState.artifactGenDeclared, chatState.artifactGenCompleted, local.setChatLlmPercent);
  useAutoScrollEffect(local.chatBodyRef, chatMessages);

  const htmlInteraction = useHtmlPreviewInteraction(uploadedFile, interactionEditMode);
  const protoInteraction = usePrototypeInteraction(interactionEditMode);
  const artifactEditor = useArtifactEditorState(props.currentIteration, htmlInteraction.selectedHtmlPreview, interactionEditMode);

  const imagePrototypePreviews = uploadedFile?.imagePreviews ?? [];
  const selectedImagePreview = imagePrototypePreviews.find((i) => i.path === selectedImagePreviewPath) || imagePrototypePreviews[0] || null;
  const hasRichInteractionPreview = Boolean(
    (htmlInteraction.htmlPrototypePreviews.length > 0 && htmlInteraction.selectedHtmlPreview) ||
    (imagePrototypePreviews.length > 0 && selectedImagePreview)
  );
  const instrumentedHtml = useMemo(
    () => htmlInteraction.selectedHtmlPreview ? instrumentHtmlPreview(htmlInteraction.selectedHtmlPreview.content, interactionEditMode) : "",
    [htmlInteraction.selectedHtmlPreview?.path, htmlInteraction.selectedHtmlPreview?.content, interactionEditMode]
  );
  const imageSelectionSummary = buildImageSelectionSummary(protoInteraction.selectedImageRegion, protoInteraction.selectedImagePoint);
  const selectedPrototypeElement = prototypeElements.find((i) => i.id === selectedPrototypeElementId) || null;
  const prototypeTree = useMemo(() => buildPrototypeTree(prototypeElements), [prototypeElements]);
  const showInteractionEntry = Boolean(uploadedFile?.hasPrototypeAssets);
  const reportDerived = useAnalysisReportDerived(analysisReport, props.currentIteration, chatMessages, isAnalyzingAttachment, ext.tmForm.testMatrixStatusMap, local.onlyHighValue);

  usePrototypeMappingEffect(uploadedFile, local.setPrototypeElements, local.setSelectedPrototypeElementId, DEFAULT_PROTOTYPE_ELEMENTS);
  useImagePreviewPathEffect(uploadedFile, local.setSelectedImagePreviewPath, protoInteraction.setSelectedImagePoint, protoInteraction.setSelectedImageRegion);
  useInteractionClearEffect(interactionEditMode, protoInteraction.setSelectedImagePoint, protoInteraction.setSelectedImageRegion, protoInteraction.setDragImageRegion);

  return {
    ...chatState, htmlInteraction, protoInteraction, artifactEditor,
    imagePrototypePreviews, selectedImagePreview, hasRichInteractionPreview,
    instrumentedHtml, imageSelectionSummary, selectedPrototypeElement, prototypeTree, showInteractionEntry,
    reportDerived,
  };
}

type DerivedData = ReturnType<typeof useDerivedData>;

// ── Sub-hook: handlers ──

function useWorkspaceHandlers(props: IterationWorkspacePanelProps, ext: ExternalHooks, local: LocalState, derived: DerivedData) {
  const nav = usePanelNavHandlers(props, local, derived);
  const instrEditorResult = useInstrEditorHandlers(props, ext, local, derived, nav.applyPrototypeInstruction);
  return { ...nav, ...instrEditorResult };
}

function usePanelNavHandlers(props: IterationWorkspacePanelProps, local: LocalState, derived: DerivedData) {
  const { onOpenAnalysisPanel, onCloseAnalysisPanel } = props;
  const { artifactEditor } = derived;
  const { setShowInteractionPanel, setPreviewFile, setPreviewSiblingFiles } = local;

  const openAnalysisDrawer = () => {
    setShowInteractionPanel(false); setPreviewFile(null);
    const preferred = artifactEditor.artifactItems.find((i) => i.stage === artifactEditor.activeArtifactStage) || artifactEditor.artifactItems[0] || null;
    artifactEditor.setAnalysisDrawerArtifactId(preferred?.id || null);
    onOpenAnalysisPanel();
  };
  const openFilePreview = (file: UploadFileEntry, siblings?: UploadFileEntry[]) => {
    setShowInteractionPanel(false); setPreviewFile(file); setPreviewSiblingFiles(siblings || []); onOpenAnalysisPanel();
  };
  const closeFilePreview = () => { setPreviewFile(null); setPreviewSiblingFiles([]); onCloseAnalysisPanel(); };
  const openArtifactPreviewByTitle = (title: string) => {
    const matched = artifactEditor.artifactItems.find((i) => i.title === title);
    if (!matched) { openAnalysisDrawer(); return; }
    setShowInteractionPanel(false); setPreviewFile(null);
    artifactEditor.setAnalysisDrawerArtifactId(matched.id); onOpenAnalysisPanel();
  };
  const openInteractionPanel = () => { onCloseAnalysisPanel(); setShowInteractionPanel(true); };
  const applyPrototypeInstruction = (instruction: string) =>
    derived.protoInteraction.applyPrototypeInstruction(instruction, derived.selectedPrototypeElement, local.setPrototypeElements, local.setPrototypeLastPlan, local.setPrototypeHistory);

  return { openAnalysisDrawer, openFilePreview, closeFilePreview, openArtifactPreviewByTitle, openInteractionPanel, applyPrototypeInstruction };
}

function useInstrEditorHandlers(
  props: IterationWorkspacePanelProps, ext: ExternalHooks, local: LocalState, derived: DerivedData,
  applyPrototypeInstruction: (instruction: string) => { summary: string },
) {
  const { onChatSend, onSaveArtifactDraft, onCommitArtifact, onConfirmArtifact, onPatchUploadedHtmlPreview, onOpenAnalysisPanel, onCloseAnalysisPanel, onChatInputChange } = props;
  const { artifactEditor, htmlInteraction, protoInteraction, selectedPrototypeElement, imageSelectionSummary, reportDerived } = derived;
  const clarificationQuestions = reportDerived.clarificationQuestions;

  const instrHook = useInteractionInstruction({
    interactionEditMode: local.interactionEditMode, showInteractionPanel: local.showInteractionPanel,
    showAnalysisPanel: props.showAnalysisPanel, selectedArtifactKind: artifactEditor.selectedArtifactKind,
    selectedHtmlElement: htmlInteraction.selectedHtmlElement, selectedHtmlPreview: htmlInteraction.selectedHtmlPreview,
    selectedDrawerArtifact: artifactEditor.selectedDrawerArtifact, selectedArtifactHtmlContent: artifactEditor.selectedArtifactHtmlContent,
    selectedPrototypeElement, selectedImagePreview: derived.selectedImagePreview,
    selectedImageRegion: protoInteraction.selectedImageRegion, selectedImagePoint: protoInteraction.selectedImagePoint,
    imageSelectionSummary, htmlPreviewHistory: htmlInteraction.htmlPreviewHistory,
    setHtmlPreviewHistory: htmlInteraction.setHtmlPreviewHistory, applyActionsToHtmlContent: htmlInteraction.applyActionsToHtmlContent,
    applyHtmlActionsToPreview: htmlInteraction.applyHtmlActionsToPreview, getActiveHtmlPreviewWindow: htmlInteraction.getActiveHtmlPreviewWindow,
    applyPrototypeInstruction, onChatSend, onSaveArtifactDraft, onPatchUploadedHtmlPreview,
  });
  const handleComposedSend = () => { void instrHook.sendInteractionInstruction(props.chatInput); };

  const editorActions = useArtifactEditorActions({
    selectedDrawerArtifact: artifactEditor.selectedDrawerArtifact, artifactEditorValue: artifactEditor.artifactEditorValue,
    artifactEditorDirty: artifactEditor.artifactEditorDirty, artifactEditorBusy: artifactEditor.artifactEditorBusy, chatInput: props.chatInput,
    setArtifactEditorBusy: artifactEditor.setArtifactEditorBusy, setArtifactEditorDirty: artifactEditor.setArtifactEditorDirty,
    setArtifactEditorMode: artifactEditor.setArtifactEditorMode, setChangeControlNotice: ext.ccForm.setChangeControlNotice,
    setAnalysisDrawerArtifactId: artifactEditor.setAnalysisDrawerArtifactId, onSaveArtifactDraft, onCommitArtifact, onConfirmArtifact,
    onConfirmAnalysis: () => props.onConfirmIterationAnalysis({
      accurate: true, decisionEvent: "understanding-accurate", force: true,
      resolvedClarificationQuestions: Array.isArray(clarificationQuestions) ? clarificationQuestions : [],
    }),
    onOpenAnalysisPanel, onCloseAnalysisPanel, onChatInputChange,
    chatComposerInputRef: local.chatComposerInputRef,
    onTriggerCoachFollowUp: (message: string) => void onChatSend({ overrideText: message }),
  });

  const handleConfirmAnalysis = buildConfirmAnalysisHandler(
    onConfirmArtifact, props.onConfirmIterationAnalysis, clarificationQuestions, ext.ccForm.setChangeControlNotice,
  );

  return { handleComposedSend, handleConfirmAnalysis, ...instrHook, ...editorActions };
}

type WorkspaceHandlers = ReturnType<typeof useWorkspaceHandlers>;

// ── Return value builder (pure mapping, no logic) ──

function buildReturnValue(ext: ExternalHooks, local: LocalState, derived: DerivedData, handlers: WorkspaceHandlers) {
  return {
    ...buildExternalAndLocalReturn(ext, local, derived),
    ...buildDerivedAndHandlerReturn(derived, local, handlers),
  };
}

function buildExternalAndLocalReturn(ext: ExternalHooks, local: LocalState, derived: DerivedData) {
  const { drawer, ops, ccForm, tmForm, opsForm } = ext;
  return {
    interactionDrawerWidth: drawer.interactionDrawerWidth, artifactDrawerWidth: drawer.artifactDrawerWidth,
    handleInteractionDrawerResizePointerDown: drawer.handleInteractionDrawerResizePointerDown,
    handleArtifactDrawerResizePointerDown: drawer.handleArtifactDrawerResizePointerDown,
    opsTemplates: ops.opsTemplates, reloadOpsTemplates: ops.reloadOpsTemplates, buildOpsCommandTemplates: ops.buildOpsCommandTemplates,
    changeControlBusy: ccForm.changeControlBusy, setChangeControlBusy: ccForm.setChangeControlBusy,
    changeControlNotice: ccForm.changeControlNotice, setChangeControlNotice: ccForm.setChangeControlNotice,
    testMatrixStatusMap: tmForm.testMatrixStatusMap, setTestMatrixStatusMap: tmForm.setTestMatrixStatusMap,
    testMatrixNoteMap: tmForm.testMatrixNoteMap, setTestMatrixNoteMap: tmForm.setTestMatrixNoteMap,
    ...opsForm,
    onlyHighValue: local.onlyHighValue, setOnlyHighValue: local.setOnlyHighValue,
    dragOver: local.dragOver, setDragOver: local.setDragOver,
    chatBodyRef: local.chatBodyRef, chatLlmPercent: local.chatLlmPercent,
    isChatProcessing: derived.isChatProcessing,
    artifactGenDeclared: derived.artifactGenDeclared, artifactGenCompleted: derived.artifactGenCompleted,
    artifactGenInProgress: derived.artifactGenInProgress, artifactGenAllDone: derived.artifactGenAllDone,
    showInteractionPanel: local.showInteractionPanel, setShowInteractionPanel: local.setShowInteractionPanel,
    previewFile: local.previewFile, previewSiblingFiles: local.previewSiblingFiles,
    interactionEditMode: local.interactionEditMode, setInteractionEditMode: local.setInteractionEditMode,
    selectedPrototypeElementId: local.selectedPrototypeElementId, setSelectedPrototypeElementId: local.setSelectedPrototypeElementId,
    prototypeElements: local.prototypeElements, setPrototypeElements: local.setPrototypeElements,
    prototypeLastPlan: local.prototypeLastPlan, setPrototypeLastPlan: local.setPrototypeLastPlan,
    prototypeHistory: local.prototypeHistory, setPrototypeHistory: local.setPrototypeHistory,
    chatComposerInputRef: local.chatComposerInputRef, analysisScrollRef: local.analysisScrollRef,
  };
}

function buildDerivedAndHandlerReturn(derived: DerivedData, local: LocalState, handlers: WorkspaceHandlers) {
  const { htmlInteraction, protoInteraction, artifactEditor } = derived;
  return {
    interactionInstruction: htmlInteraction.interactionInstruction, setInteractionInstruction: htmlInteraction.setInteractionInstruction,
    setHoveredHtmlElement: htmlInteraction.setHoveredHtmlElement,
    selectedHtmlElement: htmlInteraction.selectedHtmlElement, setSelectedHtmlElement: htmlInteraction.setSelectedHtmlElement,
    htmlPreviewHistory: htmlInteraction.htmlPreviewHistory, setHtmlPreviewHistory: htmlInteraction.setHtmlPreviewHistory,
    htmlPreviewFrameRef: htmlInteraction.htmlPreviewFrameRef, artifactHtmlPreviewFrameRef: htmlInteraction.artifactHtmlPreviewFrameRef,
    selectedHtmlPreview: htmlInteraction.selectedHtmlPreview, setSelectedHtmlPreviewPath: htmlInteraction.setSelectedHtmlPreviewPath,
    htmlPrototypePreviews: htmlInteraction.htmlPrototypePreviews,
    selectedImagePoint: protoInteraction.selectedImagePoint, setSelectedImagePoint: protoInteraction.setSelectedImagePoint,
    selectedImageRegion: protoInteraction.selectedImageRegion, setSelectedImageRegion: protoInteraction.setSelectedImageRegion,
    dragImageRegion: protoInteraction.dragImageRegion, imageWrapRef: protoInteraction.imageWrapRef,
    handleImagePointerDown: protoInteraction.handleImagePointerDown, handleImagePointerMove: protoInteraction.handleImagePointerMove,
    handleImagePointerUp: protoInteraction.handleImagePointerUp, handleImagePointerCancel: protoInteraction.handleImagePointerCancel,
    artifactItems: artifactEditor.artifactItems, activeArtifactStage: artifactEditor.activeArtifactStage,
    setAnalysisDrawerArtifactId: artifactEditor.setAnalysisDrawerArtifactId,
    selectedDrawerArtifact: artifactEditor.selectedDrawerArtifact, selectedArtifactKind: artifactEditor.selectedArtifactKind,
    artifactDraftContent: artifactEditor.artifactDraftContent, isEditableTextArtifact: artifactEditor.isEditableTextArtifact,
    artifactEditorSource: artifactEditor.artifactEditorSource,
    artifactEditorValue: artifactEditor.artifactEditorValue, setArtifactEditorValue: artifactEditor.setArtifactEditorValue,
    artifactEditorDirty: artifactEditor.artifactEditorDirty, setArtifactEditorDirty: artifactEditor.setArtifactEditorDirty,
    artifactEditorBusy: artifactEditor.artifactEditorBusy, setArtifactEditorBusy: artifactEditor.setArtifactEditorBusy,
    artifactEditorMode: artifactEditor.artifactEditorMode, setArtifactEditorMode: artifactEditor.setArtifactEditorMode,
    selectedArtifactHtmlContent: artifactEditor.selectedArtifactHtmlContent,
    selectedArtifactHtmlPreview: artifactEditor.selectedArtifactHtmlPreview,
    analysisDraftSections: artifactEditor.analysisDraftSections,
    selectedArtifactAwaitingConfirmation: artifactEditor.selectedArtifactAwaitingConfirmation,
    canEditSelectedTextArtifact: artifactEditor.canEditSelectedTextArtifact,
    imagePrototypePreviews: derived.imagePrototypePreviews, selectedImagePreview: derived.selectedImagePreview,
    selectedImagePreviewPath: local.selectedImagePreviewPath, setSelectedImagePreviewPath: local.setSelectedImagePreviewPath,
    hasRichInteractionPreview: derived.hasRichInteractionPreview, instrumentedHtmlPreview: derived.instrumentedHtml,
    imageSelectionSummary: derived.imageSelectionSummary, selectedPrototypeElement: derived.selectedPrototypeElement,
    prototypeTree: derived.prototypeTree, showInteractionEntry: derived.showInteractionEntry,
    ...derived.reportDerived, ...handlers,
  };
}

// ── Small effect helpers ──

function useChatLlmProgressEffect(
  chatSendStatus: string,
  isChatProcessing: boolean,
  artifactGenDeclared: string[],
  artifactGenCompleted: string[],
  setChatLlmPercent: (fn: number | ((prev: number) => number)) => void,
) {
  useEffect(() => {
    if (chatSendStatus === "sending" || chatSendStatus === "sent") {
      setChatLlmPercent(10);
      return;
    }
    if (isChatProcessing) {
      const base = computeLlmBase(chatSendStatus, artifactGenDeclared, artifactGenCompleted);
      setChatLlmPercent(base);
      const timer = setInterval(() => {
        setChatLlmPercent((prev: number) => (prev < 88 ? prev + (90 - prev) * 0.04 : prev));
      }, 600);
      return () => clearInterval(timer);
    }
    setChatLlmPercent(0);
  }, [chatSendStatus]);
}

function useAutoScrollEffect(ref: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [deps]);
}

function usePrototypeMappingEffect(
  uploadedFile: IterationWorkspacePanelProps["uploadedFile"],
  setElements: React.Dispatch<React.SetStateAction<PrototypeElement[]>>,
  setSelectedId: React.Dispatch<React.SetStateAction<string>>,
  defaults: PrototypeElement[],
) {
  useEffect(() => {
    if (!uploadedFile?.hasPrototypeAssets) return;
    const mapped = mapPrototypeItems(uploadedFile.prototypeItems || []);
    if (mapped.length > 0) { setElements(mapped); setSelectedId(mapped[0].id); }
    else { setElements(defaults); setSelectedId(defaults[0].id); }
  }, [uploadedFile?.iterationId, uploadedFile?.hasPrototypeAssets, uploadedFile?.prototypeItems]);
}

function useImagePreviewPathEffect(
  uploadedFile: IterationWorkspacePanelProps["uploadedFile"],
  setPath: React.Dispatch<React.SetStateAction<string>>,
  setPoint: (v: null) => void,
  setRegion: (v: null) => void,
) {
  useEffect(() => {
    const previews = uploadedFile?.imagePreviews ?? [];
    if (previews.length === 0) { setPath(""); setPoint(null); setRegion(null); return; }
    setPath((prev) => (previews.some((i) => i.path === prev) ? prev : previews[0].path));
  }, [uploadedFile?.iterationId, uploadedFile?.imagePreviews]);
}

function useInteractionClearEffect(
  editMode: boolean, setPoint: (v: null) => void,
  setRegion: (v: null) => void, setDrag: (v: null) => void,
) {
  useEffect(() => {
    if (editMode) return;
    setPoint(null); setRegion(null); setDrag(null);
  }, [editMode]);
}
