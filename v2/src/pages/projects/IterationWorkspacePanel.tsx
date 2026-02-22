import { useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type {
  AttachmentAnalysisReport,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationStatus,
  IterationMessage,
  IterationVisualEditResponse,
} from "../../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../../domain/workspace/analysisTypes";
import type { OpsTriageTemplate } from "../../domain/workspace/platformTypes";
import { deleteOpsTriageTemplate, fetchOpsTriageTemplates, upsertOpsTriageTemplate } from "../../app/workspaceApi";

type PrototypeElement = {
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

type PrototypeChangeHistoryItem = {
  id: string;
  targetId: string;
  targetLabel: string;
  instruction: string;
  summary: string;
  before: PrototypeElement;
  after: PrototypeElement;
  at: string;
};

type HtmlPreviewInteractionPayload = {
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

type ImageSelectionRegion = {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

type HtmlPreviewHistoryItem = {
  path: string;
  selector: string;
  text: string;
  styles: Partial<Record<"color" | "backgroundColor" | "fontSize" | "fontWeight" | "width" | "height" | "display", string>>;
};

const getInteractionDrawerWidthBounds = (viewportWidth: number) => {
  const max = Math.max(360, Math.round(viewportWidth * 0.96));
  const min = Math.min(420, max);
  return { min, max };
};

function patchHtmlRuntimeForPreview(content: string) {
  const guardedContent = content.replace(
    /\btailwind\.config\s*\(/g,
    "(window.tailwind && typeof window.tailwind.config === 'function' ? window.tailwind.config.bind(window.tailwind) : function(){})("
  );
  const fallbackPrelude = `
<script>
(() => {
  if (typeof window.Chart !== "function") {
    class ChartStub {
      constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
        this.data = (config && config.data) || {};
        this.options = (config && config.options) || {};
      }
      destroy() {}
      update() {}
      resize() {}
      reset() {}
      render() {}
      stop() {}
      clear() {}
      toBase64Image() { return ""; }
    }
    ChartStub.defaults = {};
    ChartStub.instances = {};
    ChartStub.overrides = {};
    ChartStub.register = () => {};
    ChartStub.unregister = () => {};
    ChartStub.getChart = () => null;
    window.Chart = ChartStub;
  }
})();
</script>`;
  if (/<head[^>]*>/i.test(guardedContent)) {
    return guardedContent.replace(/<head([^>]*)>/i, `<head$1>${fallbackPrelude}`);
  }
  return `${fallbackPrelude}\n${guardedContent}`;
}

function instrumentHtmlPreview(content: string, enableInteraction: boolean) {
  const runtimePatchedContent = patchHtmlRuntimeForPreview(content);
  const script = `
<script>
(() => {
  if (window.__buildwisePreviewInjected) return;
  window.__buildwisePreviewInjected = true;
  const interactionEnabled = ${enableInteraction ? "true" : "false"};
  const fitStyle = document.createElement("style");
  fitStyle.textContent = [
    "html, body { min-width: 0 !important; }",
    "body { overflow-x: hidden !important; overflow-y: auto !important; }",
    "* { box-sizing: border-box; }",
    "img, svg, canvas, video, iframe { max-width: 100% !important; height: auto; }",
    ".container, [class*='container'] { max-width: 100% !important; }",
    "body > * { max-width: 100% !important; }"
  ].join("\\n");
  if (document.head) document.head.appendChild(fitStyle);
  else document.addEventListener("DOMContentLoaded", () => document.head && document.head.appendChild(fitStyle), { once: true });
  const getContentBounds = (body) => {
    let rightEdge = 0;
    let bottomEdge = 0;
    for (const child of Array.from(body.children || [])) {
      if (!(child instanceof HTMLElement)) continue;
      const rect = child.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      rightEdge = Math.max(rightEdge, rect.right);
      bottomEdge = Math.max(bottomEdge, rect.bottom);
    }
    return {
      width: Math.max(1, Math.round(rightEdge)),
      height: Math.max(1, Math.round(bottomEdge))
    };
  };
  const applyResponsiveFit = () => {
    const docEl = document.documentElement;
    const body = document.body;
    if (!docEl || !body) return;
    const style = docEl.style;
    style.zoom = "1";
    body.style.margin = "0";
    body.style.transformOrigin = "top left";
    body.style.width = "auto";
    body.style.transform = "none";
    body.style.minHeight = "0";
    const viewportWidth = Math.max(1, docEl.clientWidth || window.innerWidth || 1);
    const bounds = getContentBounds(body);
    const fallbackWidth = Math.max(1, body.scrollWidth, docEl.scrollWidth, Math.round(body.getBoundingClientRect().width));
    const contentWidth = Math.max(1, Math.min(fallbackWidth, bounds.width || fallbackWidth));
    const scale = Math.max(0.5, Math.min(2.4, viewportWidth / contentWidth));
    body.style.transform = "scale(" + scale + ")";
    body.style.width = contentWidth + "px";
    const contentHeight = Math.max(1, bounds.height, body.scrollHeight, docEl.scrollHeight);
    body.style.minHeight = Math.ceil(contentHeight * scale) + "px";
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyResponsiveFit(), { once: true });
  } else {
    applyResponsiveFit();
  }
  window.addEventListener("load", () => applyResponsiveFit(), { once: true });
  window.addEventListener("resize", () => applyResponsiveFit());
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => applyResponsiveFit());
    ro.observe(document.documentElement);
  }
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2147483647";
  overlay.style.border = "2px solid #2563eb";
  overlay.style.boxShadow = "0 0 0 9999px rgba(37,99,235,.08), 0 0 0 1px rgba(37,99,235,.35)";
  overlay.style.borderRadius = "8px";
  overlay.style.display = "none";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(overlay), { once: true });
  if (document.body) document.body.appendChild(overlay);
  let selectedEl = null;
  const ignoredTags = new Set(["HTML","BODY","SCRIPT","STYLE","LINK","META"]);
  const cssPath = (node) => {
    if (!node || node.nodeType !== 1) return "";
    const el = node;
    if (el.id) return "#" + el.id;
    const cls = Array.from(el.classList || []).slice(0, 2).join(".");
    return el.tagName.toLowerCase() + (cls ? "." + cls : "");
  };
  const buildSelector = (node) => {
    const parts = [];
    let cur = node;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      parts.unshift(cssPath(cur));
      cur = cur.parentElement;
    }
    return parts.filter(Boolean).join(" > ").slice(0, 180);
  };
  const updateOverlay = (el) => {
    if (!el) {
      overlay.style.display = "none";
      return;
    }
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "block";
    overlay.style.left = rect.left + "px";
    overlay.style.top = rect.top + "px";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
  };
  const send = (type, el) => {
    if (!el || ignoredTags.has(el.tagName)) return;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const style = window.getComputedStyle(el);
    window.parent.postMessage({
      source: "buildwise-html-preview",
      type,
      payload: {
        selector: buildSelector(el),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
        styles: {
          color: style.color || "",
          backgroundColor: style.backgroundColor || "",
          fontSize: style.fontSize || "",
          fontWeight: style.fontWeight || "",
          borderRadius: style.borderRadius || "",
          padding: style.padding || "",
          margin: style.margin || ""
        }
      }
    }, "*");
  };
  if (interactionEnabled) {
    document.addEventListener("mousemove", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (selectedEl) return;
      send("hover", target);
    }, true);
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      event.preventDefault();
      event.stopPropagation();
      selectedEl = target;
      updateOverlay(selectedEl);
      send("select", selectedEl);
    }, true);
  }
  window.addEventListener("scroll", () => selectedEl && updateOverlay(selectedEl), true);
  window.addEventListener("resize", () => selectedEl && updateOverlay(selectedEl), true);
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (!data || data.source !== "buildwise-visual-edit-host") return;
    const payload = data.payload || {};
    const selector = typeof payload.selector === "string" ? payload.selector.trim() : "";
    const resolveTarget = () => {
      if (selectedEl && selectedEl.isConnected) return selectedEl;
      if (selector) {
        try {
          const found = document.querySelector(selector);
          if (found instanceof Element) return found;
        } catch {
          return null;
        }
      }
      return null;
    };
    const target = resolveTarget();
    if (!target || ignoredTags.has(target.tagName)) return;
    if (data.type === "apply-actions" && Array.isArray(payload.actions)) {
      for (const action of payload.actions) {
        if (!action || typeof action !== "object") continue;
        if (action.op === "set-text" && typeof action.value === "string") {
          target.textContent = action.value;
          continue;
        }
        if ((action.op === "set-style" || action.op === "resize") && typeof action.property === "string" && typeof action.value === "string") {
          target.style[action.property] = action.value;
          continue;
        }
        if (action.op === "toggle-visibility") {
          target.style.display = action.value === "hidden" ? "none" : "";
        }
      }
      selectedEl = target;
      updateOverlay(target);
      send("select", target);
      return;
    }
    if (data.type === "restore-snapshot" && payload.snapshot && typeof payload.snapshot === "object") {
      const snapshot = payload.snapshot;
      if (typeof snapshot.text === "string") {
        target.textContent = snapshot.text;
      }
      if (snapshot.styles && typeof snapshot.styles === "object") {
        for (const key of Object.keys(snapshot.styles)) {
          const value = snapshot.styles[key];
          if (typeof value === "string") {
            target.style[key] = value;
          }
        }
      }
      selectedEl = target;
      updateOverlay(target);
      send("select", target);
    }
  });
})();
</script>`;
  if (/<\/body>/i.test(runtimePatchedContent)) {
    return runtimePatchedContent.replace(/<\/body>/i, `${script}</body>`);
  }
  return `${runtimePatchedContent}\n${script}`;
}

type IterationWorkspacePanelProps = {
  currentIteration: Iteration | null;
  error: string | null;
  contextData: IterationContextPayload | null;
  stateMachine: IterationStateMachinePayload | null;
  chatMessages: IterationMessage[];
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  uploadedFile: UploadedAttachmentMeta | null;
  analysisReport: AttachmentAnalysisReport | null;
  showAnalysisPanel: boolean;
  isAnalyzingAttachment: boolean;
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  onUploadClick: () => void;
  onOpenAnalysisPanel: () => void;
  onCloseAnalysisPanel: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles: (files: File[]) => void | Promise<void>;
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
  onUpdateClarificationDraft: (resolvedQuestions: string[]) => void | Promise<void>;
  onConfirmIterationAnalysis: (payload: {
    accurate: boolean;
    note?: string;
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
  onTransitionState: (toStatus: IterationStatus) => void;
  onSwitchToProjectPanel: () => void;
  onPatchUploadedHtmlPreview?: (path: string, content: string) => void;
};

export function IterationWorkspacePanel({
  currentIteration,
  error,
  contextData,
  stateMachine,
  chatMessages,
  chatInput,
  fileInputRef,
  uploadedFile,
  analysisReport,
  showAnalysisPanel,
  isAnalyzingAttachment,
  uploadAnalysisProgress,
  onUploadClick,
  onOpenAnalysisPanel,
  onCloseAnalysisPanel,
  onUpload,
  onUploadFiles,
  onChatInputChange,
  onChatSend,
  onUpdateClarificationDraft,
  onConfirmIterationAnalysis,
  onUpdateIterationBoundary,
  onUpdateTestMatrixExecution,
  onGenerateTestArtifacts,
  onRefreshReleaseReview,
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
  const [opsTemplates, setOpsTemplates] = useState<OpsTriageTemplate[]>([]);
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
  const [selectedHtmlPreviewPath, setSelectedHtmlPreviewPath] = useState("");
  const [selectedPrototypeElementId, setSelectedPrototypeElementId] = useState("page-title");
  const [prototypeElements, setPrototypeElements] = useState<PrototypeElement[]>(defaultPrototypeElements);
  const [prototypeLastPlan, setPrototypeLastPlan] = useState<string[]>([]);
  const [prototypeHistory, setPrototypeHistory] = useState<PrototypeChangeHistoryItem[]>([]);
  const [hoveredHtmlElement, setHoveredHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [selectedHtmlElement, setSelectedHtmlElement] = useState<HtmlPreviewInteractionPayload | null>(null);
  const [selectedImagePreviewPath, setSelectedImagePreviewPath] = useState("");
  const [selectedImagePoint, setSelectedImagePoint] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [selectedImageRegion, setSelectedImageRegion] = useState<ImageSelectionRegion | null>(null);
  const [dragImageRegion, setDragImageRegion] = useState<ImageSelectionRegion | null>(null);
  const [interactionInstruction, setInteractionInstruction] = useState("");
  const [interactionDrawerWidth, setInteractionDrawerWidth] = useState(() => {
    if (typeof window === "undefined") {
      return 680;
    }
    try {
      const raw = window.localStorage.getItem("buildwise:interaction-drawer-width");
      const parsed = Number(raw);
      const { min, max } = getInteractionDrawerWidthBounds(window.innerWidth);
      if (!Number.isFinite(parsed)) {
        return Math.min(680, max);
      }
      return Math.max(min, Math.min(max, parsed));
    } catch {
      return 680;
    }
  });
  const [htmlPreviewHistory, setHtmlPreviewHistory] = useState<HtmlPreviewHistoryItem[]>([]);
  const imageWrapRef = useRef<HTMLButtonElement | null>(null);
  const htmlPreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const imageDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const interactionDrawerResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
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
  const hasStateMachineHistory = transitionHistory.length > 0;
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
  const showInteractionEntry = Boolean(
    currentIteration?.interactionState?.hasPrototypeAssets ||
      uploadedFile?.hasPrototypeAssets ||
      chatMessages.some(
        (msg) =>
          msg.role === "assistant" &&
          (msg.content.includes("交互界面") || msg.content.includes("可交互原型") || msg.content.includes("HTML 原型附件"))
      )
  );
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
    const onPointerMove = (event: PointerEvent) => {
      const resizeState = interactionDrawerResizeRef.current;
      if (!resizeState) {
        return;
      }
      const delta = resizeState.startX - event.clientX;
      const { min, max } = getInteractionDrawerWidthBounds(window.innerWidth);
      const next = Math.max(min, Math.min(max, resizeState.startWidth + delta));
      setInteractionDrawerWidth(next);
    };
    const onPointerUp = () => {
      interactionDrawerResizeRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const { min, max } = getInteractionDrawerWidthBounds(window.innerWidth);
      setInteractionDrawerWidth((prev) => Math.max(min, Math.min(max, prev)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem("buildwise:interaction-drawer-width", String(interactionDrawerWidth));
    } catch {
      // ignore storage failure
    }
  }, [interactionDrawerWidth]);

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

  useEffect(() => {
    let cancelled = false;
    fetchOpsTriageTemplates(currentIteration?.projectId)
      .then((payload) => {
        if (!cancelled) {
          setOpsTemplates(payload.templates || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOpsTemplates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentIteration?.projectId]);

  const parseLines = (value: string) =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

  const reloadOpsTemplates = async () => {
    const payload = await fetchOpsTriageTemplates(currentIteration?.projectId);
    setOpsTemplates(payload.templates || []);
  };

  const buildOpsCommandTemplates = (step: string, projectId: number, templates: OpsTriageTemplate[]) => {
    const lowered = step.toLowerCase();
    const matched = templates.filter((template) => template.keywords.some((keyword) => lowered.includes(keyword.toLowerCase())));
    if (matched.length > 0) {
      const applyVars = (command: string) =>
        command
          .split("{{projectId}}")
          .join(String(projectId))
          .split("{{apiBase}}")
          .join("http://127.0.0.1:5055")
          .split("{{backendDir}}")
          .join("backend");
      return Array.from(
        new Set(
          matched
            .flatMap((template) => template.commands)
            .map((command) => applyVars(command))
        )
      ).slice(0, 6);
    }
    const commands: string[] = [];
    if (lowered.includes("健康") || lowered.includes("health") || lowered.includes("就绪") || lowered.includes("ready")) {
      commands.push("curl -sS http://127.0.0.1:5055/health");
      commands.push("curl -sS http://127.0.0.1:5055/ready");
    }
    if (lowered.includes("指标") || lowered.includes("metric") || lowered.includes("错误率") || lowered.includes("延迟")) {
      commands.push("curl -sS http://127.0.0.1:5055/api/ops/metrics");
      commands.push("curl -sS http://127.0.0.1:5055/api/ops/runtime");
    }
    if (lowered.includes("发布") || lowered.includes("deploy")) {
      commands.push("curl -sS http://127.0.0.1:5055/api/ops/deployments");
      commands.push(`cd backend && PROJECT_ID=${projectId} npm run ops:rollback`);
    }
    if (lowered.includes("回滚") || lowered.includes("rollback")) {
      commands.push(`cd backend && PROJECT_ID=${projectId} npm run ops:rollback`);
    }
    if (commands.length === 0) {
      commands.push("curl -sS http://127.0.0.1:5055/api/ops/runtime");
      commands.push("curl -sS http://127.0.0.1:5055/api/ops/metrics");
    }
    return Array.from(new Set(commands)).slice(0, 4);
  };

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

  const resolveActionButtons = (content: string) => {
    if (!content.startsWith("操作建议：")) {
      return [];
    }
    return content
      .replace(/^操作建议：/, "")
      .split("；")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  };

  const resolveActionCard = (content: string) => {
    if (!content.startsWith("操作建议JSON:")) {
      return null;
    }
    const raw = content.replace(/^操作建议JSON:/, "").trim();
    try {
      const parsed = JSON.parse(raw) as {
        intent?: string;
        priority?: string;
        uploadRecommended?: boolean;
        actions?: string[];
        checklist?: string[];
        prerequisites?: string[];
      };
      const actions = Array.isArray(parsed.actions)
        ? parsed.actions.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 4)
        : [];
      const checklist = Array.isArray(parsed.checklist)
        ? parsed.checklist.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 4)
        : [];
      const prerequisites = Array.isArray(parsed.prerequisites)
        ? parsed.prerequisites.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 3)
        : [];
      return {
        intent: parsed.intent || "general",
        priority: (parsed.priority || "P2").toUpperCase(),
        uploadRecommended: Boolean(parsed.uploadRecommended),
        actions,
        checklist,
        prerequisites
      };
    } catch {
      return null;
    }
  };

  const handleQuickAction = (action: string) => {
    if (/上传|附件|文件夹/.test(action)) {
      onUploadClick();
      return;
    }
    if (/查看分析报告|分析报告|确认边界|锁定边界|测试矩阵|验收/.test(action)) {
      onOpenAnalysisPanel();
      return;
    }
    onChatInputChange(action);
  };

  const renderIntentLabel = (intent: string) => {
    if (intent === "collect-attachment") return "引导上传";
    if (intent === "clarify") return "澄清收敛";
    if (intent === "confirm-boundary") return "边界确认";
    if (intent === "plan") return "计划推进";
    if (intent === "qa") return "验收推进";
    if (intent === "release") return "发布准备";
    return "通用引导";
  };

  const applyPrototypeInstruction = (instruction: string) => {
    const selected = selectedPrototypeElement;
    const normalized = instruction.trim();
    if (!selected || !normalized) {
      return { applied: false, summary: "未识别有效修改。", plan: [] as string[] };
    }
    const colorMap: Record<string, { background: string; color: string }> = {
      蓝色: { background: "#2563eb", color: "#ffffff" },
      绿色: { background: "#16a34a", color: "#ffffff" },
      橙色: { background: "#ea580c", color: "#ffffff" },
      红色: { background: "#dc2626", color: "#ffffff" },
      灰色: { background: "#475569", color: "#ffffff" }
    };
    const quotedText = normalized.match(/["“](.+?)["”]/)?.[1];
    const renamedText =
      quotedText ||
      normalized.match(/(?:改成|改为|改名为|文案改为)\s*[:：]?\s*(.+)$/)?.[1]?.trim() ||
      "";
    const next = { ...selected };
    const plan: string[] = [];
    if (renamedText && renamedText !== selected.label) {
      next.label = renamedText;
      plan.push(`文案 → ${renamedText}`);
    }
    if (/隐藏|删除|移除/.test(normalized) && selected.visible) {
      next.visible = false;
      plan.push("可见性 → 隐藏");
    }
    if (/显示|恢复/.test(normalized) && !selected.visible) {
      next.visible = true;
      plan.push("可见性 → 显示");
    }
    if (/加粗|强调/.test(normalized) && !selected.emphasized) {
      next.emphasized = true;
      plan.push("强调状态 → 开启");
    }
    if (/取消加粗|去强调/.test(normalized) && selected.emphasized) {
      next.emphasized = false;
      plan.push("强调状态 → 关闭");
    }
    const widthMatch = normalized.match(/宽(?:度)?\s*(\d{2,4})/);
    if (widthMatch) {
      const width = Math.max(120, Math.min(900, Number(widthMatch[1])));
      if (width !== selected.width) {
        next.width = width;
        plan.push(`宽度 → ${width}`);
      }
    }
    const heightMatch = normalized.match(/高(?:度)?\s*(\d{2,4})/);
    if (heightMatch) {
      const height = Math.max(32, Math.min(600, Number(heightMatch[1])));
      if (height !== selected.height) {
        next.height = height;
        plan.push(`高度 → ${height}`);
      }
    }
    if (/变大|放大/.test(normalized)) {
      const width = Math.min(900, next.width + 40);
      const height = Math.min(600, next.height + 10);
      if (width !== next.width || height !== next.height) {
        next.width = width;
        next.height = height;
        plan.push(`尺寸 → ${width}×${height}`);
      }
    }
    if (/变小|缩小/.test(normalized)) {
      const width = Math.max(120, next.width - 40);
      const height = Math.max(32, next.height - 10);
      if (width !== next.width || height !== next.height) {
        next.width = width;
        next.height = height;
        plan.push(`尺寸 → ${width}×${height}`);
      }
    }
    for (const [key, color] of Object.entries(colorMap)) {
      if (normalized.includes(key) && (next.background !== color.background || next.color !== color.color)) {
        next.background = color.background;
        next.color = color.color;
        plan.push(`配色 → ${key}`);
      }
    }
    if (plan.length === 0) {
      setPrototypeLastPlan(["未识别到可执行属性变更（可尝试：文案、颜色、宽高、显隐、强调）。"]);
      return { applied: false, summary: "未识别有效修改。", plan: [] as string[] };
    }
    setPrototypeElements((prev) => prev.map((item) => (item.id === selected.id ? next : item)));
    setPrototypeLastPlan(plan);
    const summary = plan.join("；");
    const historyItem: PrototypeChangeHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      targetId: selected.id,
      targetLabel: selected.label,
      instruction: normalized,
      summary,
      before: selected,
      after: next,
      at: new Date().toISOString()
    };
    setPrototypeHistory((prev) => [historyItem, ...prev].slice(0, 20));
    return { applied: true, summary, plan };
  };

  const toPercentPoint = (clientX: number, clientY: number) => {
    const el = imageWrapRef.current;
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return {
      xPercent: (x / rect.width) * 100,
      yPercent: (y / rect.height) * 100
    };
  };

  const handleImagePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!interactionEditMode) {
      return;
    }
    const point = toPercentPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    imageDragStartRef.current = { x: point.xPercent, y: point.yPercent };
    setDragImageRegion({
      xPercent: point.xPercent,
      yPercent: point.yPercent,
      widthPercent: 0,
      heightPercent: 0
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleImagePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!interactionEditMode || !imageDragStartRef.current) {
      return;
    }
    const point = toPercentPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }
    const start = imageDragStartRef.current;
    const xPercent = Math.min(start.x, point.xPercent);
    const yPercent = Math.min(start.y, point.yPercent);
    const widthPercent = Math.abs(point.xPercent - start.x);
    const heightPercent = Math.abs(point.yPercent - start.y);
    setDragImageRegion({ xPercent, yPercent, widthPercent, heightPercent });
  };

  const finalizeImageSelection = (clientX: number, clientY: number) => {
    const point = toPercentPoint(clientX, clientY);
    const start = imageDragStartRef.current;
    const draft = dragImageRegion;
    imageDragStartRef.current = null;
    setDragImageRegion(null);
    if (!point || !start) {
      return;
    }
    if (draft && (draft.widthPercent >= 1.2 || draft.heightPercent >= 1.2)) {
      setSelectedImageRegion(draft);
      setSelectedImagePoint(null);
      return;
    }
    setSelectedImagePoint(point);
    setSelectedImageRegion(null);
  };

  const handleImagePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!interactionEditMode) {
      return;
    }
    finalizeImageSelection(event.clientX, event.clientY);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleImagePointerCancel = () => {
    if (!interactionEditMode) {
      return;
    }
    imageDragStartRef.current = null;
    setDragImageRegion(null);
  };

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

  const applyHtmlActionsToPreview = (selector: string, result: IterationVisualEditResponse) => {
    const frameWindow = htmlPreviewFrameRef.current?.contentWindow;
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
    const frameWindow = htmlPreviewFrameRef.current?.contentWindow;
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
    const sourcePreview = htmlPrototypePreviews.find((item) => item.path === latest.path);
    if (sourcePreview) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(sourcePreview.content, "text/html");
      const target = latest.selector ? doc.querySelector(latest.selector) : null;
      if (target) {
        target.textContent = latest.text;
        for (const [key, value] of Object.entries(latest.styles)) {
          if (!value) {
            continue;
          }
          (target as HTMLElement).style.setProperty(key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`), value);
        }
        onPatchUploadedHtmlPreview?.(latest.path, doc.documentElement.outerHTML);
      }
    }
    setHtmlPreviewHistory((prev) => prev.slice(1));
  };

  const sendInteractionInstruction = async (instruction: string) => {
    const text = instruction.trim();
    if (!text) {
      return;
    }
    if (showInteractionPanel && interactionEditMode && selectedHtmlPreview && /撤销|回退/.test(text) && htmlPreviewHistory.length > 0) {
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
    if (showInteractionPanel && interactionEditMode && selectedHtmlPreview && selectedHtmlElement) {
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
        const nextContent = applyActionsToHtmlContent(selectedHtmlPreview.content, selectedHtmlElement.selector, result);
        if (nextContent !== selectedHtmlPreview.content) {
          onPatchUploadedHtmlPreview?.(selectedHtmlPreview.path, nextContent);
        }
        setHtmlPreviewHistory((prev) => [
          {
            path: selectedHtmlPreview.path,
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

  const handleInteractionDrawerResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    interactionDrawerResizeRef.current = {
      startX: event.clientX,
      startWidth: interactionDrawerWidth
    };
    event.currentTarget.setPointerCapture(event.pointerId);
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
          <div className="chat-tools" />
        </div>
        {error ? (
          <div className="inline-error-banner" role="alert" aria-live="assertive">
            {error}
          </div>
        ) : null}
        <div className="iteration-meta-grid">
          <div className="info-box">
            <p className="hint">继承来源</p>
            <p>{contextData?.previous ? contextData.previous.name : "无（首个版本）"}</p>
          </div>
          <div className="info-box">
            <p className="hint">范围项</p>
            <p>in: {scopeInCount} / out: {scopeOutCount}</p>
          </div>
          <div className="info-box">
            <p className="hint">验收标准</p>
            <p>{acceptanceCount} 项</p>
          </div>
        </div>
        <div className={`info-box state-machine-box ${!hasStateMachineActions && !hasStateMachineHistory ? "compact" : ""}`}>
          <div className="state-machine-head">
            <p className="hint">迭代状态</p>
            <span className={`status-pill ${stateMachine?.currentStatus || currentIteration?.status || "planned"}`}>
              {renderStatusLabel(stateMachine?.currentStatus || currentIteration?.status || "planned")}
            </span>
          </div>
          {hasStateMachineActions ? (
            <div className="state-machine-actions">
              {allowedTransitions.map((status) => (
                <button key={status} type="button" className="btn ghost mini" onClick={() => onTransitionState(status)}>
                  流转到 {renderStatusLabel(status)}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint state-machine-inline-hint">当前状态暂无可执行流转。</p>
          )}
          {hasStateMachineHistory ? (
            <ul className="state-transition-list">
              {transitionHistory.slice(0, 5).map((item) => (
                <li key={`${item.id}-${item.createdAt}`}>
                  <strong>
                    {renderStatusLabel(item.fromStatus)} → {renderStatusLabel(item.toStatus)}
                  </strong>
                  <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
            chatMessages.map((msg) => (
              <div key={`${msg.id}-${msg.createdAt}`} className={`msg-row msg-row-${msg.role}`}>
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
                  {msg.role === "system" && resolveActionCard(msg.content) ? (
                    (() => {
                      const card = resolveActionCard(msg.content);
                      if (!card) return null;
                      return (
                        <div className="action-card">
                          <p className="action-card-title">
                            Agent 引导卡 · {renderIntentLabel(card.intent)}
                            {card.uploadRecommended ? " · 建议先上传材料" : ""}
                          </p>
                          <p className={`action-priority ${card.priority === "P0" ? "p0" : card.priority === "P1" ? "p1" : "p2"}`}>
                            优先级：{card.priority}
                          </p>
                          {card.prerequisites.length > 0 ? (
                            <ul className="action-card-list">
                              {card.prerequisites.map((item) => (
                                <li key={`prereq-${item}`}>前置条件：{item}</li>
                              ))}
                            </ul>
                          ) : null}
                          {card.actions.length > 0 ? (
                            <div className="msg-inline-actions">
                              {card.actions.map((action) => (
                                <button key={action} type="button" className="btn ghost mini" onClick={() => handleQuickAction(action)}>
                                  {action}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {card.checklist.length > 0 ? (
                            <ul className="action-card-list">
                              {card.checklist.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : (
                    <p>{msg.content}</p>
                  )}
                  {msg.role === "system" && !resolveActionCard(msg.content) && resolveActionButtons(msg.content).length > 0 ? (
                    <div className="msg-inline-actions">
                      {resolveActionButtons(msg.content).map((action) => (
                        <button key={action} type="button" className="btn ghost mini" onClick={() => handleQuickAction(action)}>
                          {action}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {getMsgKind(msg) === "event-upload" && msg.id === lastUploadMessageId ? (
                    <div className="msg-inline-actions">
                      {canOpenAnalysisPanel ? (
                        <button type="button" className="btn ghost mini attachment-report-entry" onClick={onOpenAnalysisPanel}>
                          查看分析报告
                        </button>
                      ) : null}
                      {showInteractionEntry ? (
                        <button type="button" className="btn ghost mini" onClick={() => setShowInteractionPanel(true)}>
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
            ))
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
      </article>

      <div className={`analysis-drawer-mask ${showAnalysisPanel ? "open" : ""}`} onClick={onCloseAnalysisPanel} aria-hidden={!showAnalysisPanel} />
      <aside className={`panel preview-panel context-panel artifact-preview-panel analysis-drawer ${showAnalysisPanel ? "open" : ""}`}>
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <div className="panel-head">
            <h2>分析报告</h2>
            <div className="chat-tools">
              <button type="button" className="btn ghost mini" onClick={onCloseAnalysisPanel}>
                收起报告
              </button>
            </div>
          </div>
          <div
            ref={analysisScrollRef}
            className="preview-scroll"
          >
            {!analysisReport ? (
              <div className="info-box">
                <p className="hint">暂无分析结果，请先上传附件。</p>
              </div>
            ) : (
              <>
                <div className="info-box">
                  <h3>项目概要确认（避免理解偏差）</h3>
                  <div className={`report-confirmation-banner ${reportPendingConfirmation ? "pending" : "confirmed"}`}>
                    {reportPendingConfirmation
                      ? "状态：待你确认（当前为初始理解）"
                      : `状态：已确认${reportConfirmedAt ? `（${new Date(reportConfirmedAt).toLocaleString("zh-CN")}）` : ""}`}
                  </div>
                  <p>项目：{analysisReport.projectDetection?.projectName || analysisReport.iterationName}</p>
                  <p>产品：{analysisReport.projectDetection?.productName || analysisReport.iterationName}</p>
                  <p>项目类型：{analysisReport.projectDetection?.projectCategory || analysisReport.attachmentInsights.projectCategory}</p>
                  <p>初始理解：{analysisReport.understanding}</p>
                  {!reportPendingConfirmation ? (
                    <p>确认后理解：{confirmedUnderstanding || analysisReport.understanding}</p>
                  ) : null}
                  <p className="hint">如以上定位存在偏差，请直接在 IM 输入“理解偏差：...”进行纠正，系统会按你的反馈继续收敛。</p>
                </div>
                <div className="info-box">
                  <h3>项目主要内容与特点</h3>
                  <p>项目主内容：{analysisReport.projectDetection?.projectName || analysisReport.iterationName}</p>
                  <p>产品主线：{analysisReport.projectDetection?.productName || analysisReport.iterationName}</p>
                  <p>附件特点：{analysisReport.attachmentInsights.artifactType || "未识别"}</p>
                  <p>关键特征：{(analysisReport.attachmentInsights.keyCharacteristics || []).join("；") || "暂无"}</p>
                  <p className="hint">分析时间：{new Date(analysisReport.analyzedAt).toLocaleString("zh-CN")}</p>
                </div>
                <div className="info-box">
                  <h3>出发点确认（请在 IM 回复）</h3>
                  <ul className="history-list">
                    <li className="history-item"><p>1. 本轮核心目标是否与当前理解一致？</p></li>
                    <li className="history-item"><p>2. 新增版本边界是否完整覆盖你要交付的内容？</p></li>
                    <li className="history-item"><p>3. 是否有关键约束/成功标准尚未纳入？</p></li>
                  </ul>
                  <p className="hint">直接在 IM 输入“确认一致”或“偏差点：...”即可，系统会基于你的反馈继续收敛。</p>
                  <div className="chat-tools">
                    <button type="button" className="btn ghost mini" onClick={() => onChatSend({ overrideText: "确认一致" })}>
                      发送：确认一致
                    </button>
                    <button type="button" className="btn ghost mini" onClick={() => onChatInputChange("偏差点：")}>
                      填入：偏差点
                    </button>
                  </div>
                </div>
                <div className="info-box">
                  <h3>新增版本内容边界范围</h3>
                  <p>需求边界：{currentIteration?.changeControl?.boundary?.requirementRefs?.join("；") || "未明确（请在 IM 中继续澄清）"}</p>
                  <p>组件边界：{currentIteration?.changeControl?.boundary?.componentRefs?.join("；") || "未明确（请在 IM 中继续澄清）"}</p>
                  <p>代码边界：{currentIteration?.changeControl?.boundary?.codePaths?.join("；") || "未明确（请在 IM 中继续澄清）"}</p>
                  {currentIteration?.changeControl?.boundary?.note ? <p>边界说明：{currentIteration.changeControl.boundary.note}</p> : null}
                </div>
                {(analysisReport.meaningfulFindings?.length ?? 0) > 0 ? (
                  <div className="info-box">
                    <h3>关键发现</h3>
                    <ul className="history-list">
                      {(analysisReport.meaningfulFindings || []).map((item, index) => (
                        <li key={`${item}-${index}`} className="history-item">
                          <p>{item}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {visiblePrioritizedFindings.length > 0 ? (
                  <div className="info-box">
                    <div className="panel-head">
                      <h3>优先级发现</h3>
                      <button type="button" className="btn ghost mini" onClick={() => setOnlyHighValue((prev) => !prev)}>
                        {onlyHighValue ? "显示全部" : "仅看高价值"}
                      </button>
                    </div>
                    <ul className="history-list">
                      {visiblePrioritizedFindings.map((item, index) => (
                        <li key={`${item.priority}-${item.content}-${index}`} className="history-item">
                          <strong>{item.priority}</strong>
                          <p>{item.content}</p>
                          <p className="hint">{item.reason}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {showAdvancedReportSections && generatedTestMatrix.length > 0 ? (
                  <div className="info-box">
                    <h3>测试矩阵执行</h3>
                    <p>
                      总数 {matrixSummary.total}，已执行 {matrixSummary.executed}，通过 {matrixSummary.passed}，失败 {matrixSummary.failed}，阻断 {matrixSummary.blocked}，
                      覆盖率 {matrixSummary.coverage}% ，通过率 {matrixSummary.passRate}%
                    </p>
                    <div className="chat-tools">
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={changeControlBusy}
                        onClick={() =>
                          setTestMatrixStatusMap(
                            Object.fromEntries(generatedTestMatrix.map((item) => [item.caseId, "passed"])) as Record<
                              string,
                              "pending" | "passed" | "failed" | "blocked" | "skipped"
                            >
                          )
                        }
                      >
                        全部标记为 passed
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={changeControlBusy}
                        onClick={() =>
                          setTestMatrixStatusMap(
                            Object.fromEntries(generatedTestMatrix.map((item) => [item.caseId, "pending"])) as Record<
                              string,
                              "pending" | "passed" | "failed" | "blocked" | "skipped"
                            >
                          )
                        }
                      >
                        全部重置为 pending
                      </button>
                    </div>
                    <ul className="history-list">
                      {generatedTestMatrix.map((item) => (
                        <li key={item.caseId} className="history-item">
                          <strong>
                            [{item.type}] {item.caseId}
                          </strong>
                          <p>focus：{item.focus || "-"}</p>
                          <p>expected：{item.expected || "-"}</p>
                          <p className="hint">evidence：{item.evidence || "-"}</p>
                          <div className="chat-tools">
                            <select
                              value={testMatrixStatusMap[item.caseId] || "pending"}
                              onChange={(event) => {
                                const next = event.target.value as "pending" | "passed" | "failed" | "blocked" | "skipped";
                                setTestMatrixStatusMap((prev) => ({ ...prev, [item.caseId]: next }));
                              }}
                            >
                              <option value="pending">pending</option>
                              <option value="passed">passed</option>
                              <option value="failed">failed</option>
                              <option value="blocked">blocked</option>
                              <option value="skipped">skipped</option>
                            </select>
                          </div>
                          <label className="hint">
                            执行备注
                            <textarea
                              rows={2}
                              value={testMatrixNoteMap[item.caseId] || ""}
                              onChange={(event) =>
                                setTestMatrixNoteMap((prev) => ({
                                  ...prev,
                                  [item.caseId]: event.target.value
                                }))
                              }
                            />
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="chat-tools">
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={changeControlBusy}
                        onClick={async () => {
                          const updates = generatedTestMatrix
                            .map((item) => {
                              const status = testMatrixStatusMap[item.caseId] || item.executionStatus;
                              const note = (testMatrixNoteMap[item.caseId] || "").trim();
                              const changed = status !== item.executionStatus || note !== (item.executionNote || "");
                              return changed
                                ? {
                                    caseId: item.caseId,
                                    status,
                                    note
                                  }
                                : null;
                            })
                            .filter(Boolean) as Array<{
                            caseId: string;
                            status: "pending" | "passed" | "failed" | "blocked" | "skipped";
                            note?: string;
                          }>;
                          if (updates.length === 0) {
                            return;
                          }
                          setChangeControlBusy(true);
                          try {
                            await onUpdateTestMatrixExecution(updates);
                            setChangeControlNotice(`已保存 ${updates.length} 条测试执行状态。`);
                          } finally {
                            setChangeControlBusy(false);
                          }
                        }}
                      >
                        保存测试执行状态
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={changeControlBusy}
                        onClick={async () => {
                          setChangeControlBusy(true);
                          try {
                            await onGenerateTestArtifacts(true);
                            setChangeControlNotice("已生成测试产物计划（dry-run）。");
                          } finally {
                            setChangeControlBusy(false);
                          }
                        }}
                      >
                        生成测试产物（Dry Run）
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={changeControlBusy}
                        onClick={async () => {
                          setChangeControlBusy(true);
                          try {
                            await onRefreshReleaseReview();
                            setChangeControlNotice("已刷新发布前质量评审。");
                          } finally {
                            setChangeControlBusy(false);
                          }
                        }}
                      >
                        刷新发布评审
                      </button>
                    </div>
                  </div>
                ) : null}
                {(analysisReport.nextActions?.length ?? 0) > 0 ? (
                  <div className="info-box">
                    <h3>建议确认动作</h3>
                    <ul className="history-list">
                      {(analysisReport.nextActions || []).map((item, index) => (
                        <li key={`${item}-${index}`} className="history-item">
                          <p>{item}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="hint">请在 IM 中逐项确认或修正，系统会按你的反馈更新理解与边界。</p>
                  </div>
                ) : null}
                {showAdvancedReportSections && qualityArtifacts ? (
                  <div className="info-box">
                    <h3>测试与验收产物</h3>
                    {(qualityArtifacts.acceptanceChecklist?.length ?? 0) > 0 ? (
                      <p className="hint">验收清单：{qualityArtifacts.acceptanceChecklist.join("；")}</p>
                    ) : (
                      <p className="hint">验收清单：未生成</p>
                    )}
                    {(qualityArtifacts.unitTests?.length ?? 0) > 0 ? (
                      <p className="hint">单测建议：{qualityArtifacts.unitTests.join("；")}</p>
                    ) : null}
                    {(qualityArtifacts.contractTests?.length ?? 0) > 0 ? (
                      <p className="hint">契约测试建议：{qualityArtifacts.contractTests.join("；")}</p>
                    ) : null}
                    {(qualityArtifacts.regressionPoints?.length ?? 0) > 0 ? (
                      <p className="hint">回归关注点：{qualityArtifacts.regressionPoints.join("；")}</p>
                    ) : null}
                    {(qualityArtifacts.materializedFiles?.length ?? 0) > 0 ? (
                      <p className="hint">已落盘测试产物：{qualityArtifacts.materializedFiles.join("；")}</p>
                    ) : null}
                  </div>
                ) : null}
                {showAdvancedReportSections && traceabilityMap ? (
                  <div className="info-box">
                    <h3>需求-组件-代码映射</h3>
                    <p>覆盖分：{traceabilityMap.coverageScore}%</p>
                    <p>映射置信度：{traceabilityMap.mappingConfidence?.toUpperCase?.() || "-"}</p>
                    {traceabilityMap.gaps.length > 0 ? <p className="hint">缺口：{traceabilityMap.gaps.join("；")}</p> : null}
                    {(traceabilityMap.unmappedRequirements?.length ?? 0) > 0 ? (
                      <p className="hint">未映射需求：{traceabilityMap.unmappedRequirements.join("；")}</p>
                    ) : null}
                    {(traceabilityMap.conflicts?.length ?? 0) > 0 ? (
                      <p className="hint">映射冲突：{traceabilityMap.conflicts.join("；")}</p>
                    ) : null}
                    {(traceabilityMap.requirementToCode?.length ?? 0) > 0 ? (
                      <ul className="history-list">
                        {traceabilityMap.requirementToCode.slice(0, 6).map((item, index) => (
                          <li key={`${item.requirement}-${index}`} className="history-item">
                            <strong>{item.requirement}</strong>
                            <p>代码路径：{item.codePaths.join("；") || "-"}</p>
                            <p className="hint">evidence：{item.evidence || "-"}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint">暂无可用三向映射，请先补齐 requirement/component/codePath 边界。</p>
                    )}
                  </div>
                ) : null}
                {showAdvancedReportSections && executableConstraints ? (
                  <div className="info-box">
                    <h3>可执行边界约束</h3>
                    <p>组件白名单：{executableConstraints.componentWhitelist.join("；") || "-"}</p>
                    <p>代码路径白名单：{executableConstraints.codePathWhitelist.join("；") || "-"}</p>
                    <p>验收约束：{executableConstraints.acceptanceChecks.join("；") || "-"}</p>
                    {(executableConstraints.gateRules?.length ?? 0) > 0 ? (
                      <p className="hint">门禁规则：{executableConstraints.gateRules.join("；")}</p>
                    ) : null}
                  </div>
                ) : null}
                {showAdvancedReportSections && releaseReview ? (
                  <div className="info-box">
                    <h3>发布前质量评审</h3>
                    <p>结论：{releaseReview.decision.toUpperCase()}</p>
                    <p>原因：{releaseReview.reason || "-"}</p>
                    <p>
                      信号：用例 {releaseReview.qualitySignals.testCaseCount}，P0 {releaseReview.qualitySignals.p0FindingCount}，unknown{" "}
                      {releaseReview.qualitySignals.unknownSignalCount}，边界覆盖 {releaseReview.qualitySignals.boundaryCoverage}%
                    </p>
                    {(releaseReview.blockers?.length ?? 0) > 0 ? <p className="hint">阻断项：{releaseReview.blockers.join("；")}</p> : null}
                    {(releaseReview.releaseGates?.length ?? 0) > 0 ? <p className="hint">门禁：{releaseReview.releaseGates.join("；")}</p> : null}
                    <p className="hint">
                      回滚：{releaseReview.rollback.shouldRollback ? "建议回滚" : "暂不回滚"}
                      {releaseReview.rollback.reason ? `（${releaseReview.rollback.reason}）` : ""}
                    </p>
                  </div>
                ) : null}
                {showAdvancedReportSections && domainKnowledge ? (
                  <div className="info-box">
                    <h3>领域知识抽取</h3>
                    {(domainKnowledge.terms?.length ?? 0) > 0 ? (
                      <ul className="history-list">
                        {domainKnowledge.terms.slice(0, 6).map((item, index) => (
                          <li key={`${item.term}-${index}`} className="history-item">
                            <strong>{item.term}</strong>
                            <p>{item.definition}</p>
                            <p className="hint">绑定路径：{item.mappedTo.codePaths.join("；") || "-"}</p>
                            <p className="hint">绑定强度：{item.bindingStrength?.toUpperCase?.() || "-"}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint">暂无术语抽取结果。</p>
                    )}
                    {(domainKnowledge.unknowns?.length ?? 0) > 0 ? <p className="hint">待确认：{domainKnowledge.unknowns.join("；")}</p> : null}
                  </div>
                ) : null}
                {showAdvancedReportSections && opsTriage ? (
                  <div className="info-box">
                    <h3>运维辅助建议</h3>
                    {(opsTriage.hypotheses?.length ?? 0) > 0 ? (
                      <ul className="history-list">
                        {opsTriage.hypotheses.slice(0, 4).map((item, index) => (
                          <li key={`${item.priority}-${item.item}-${index}`} className="history-item">
                            <strong>{item.priority}</strong>
                            <p>{item.item}</p>
                            <p className="hint">evidence：{item.evidence || "-"}</p>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {(opsTriage.triageSteps?.length ?? 0) > 0 ? (
                      <ul className="history-list">
                        {opsTriage.triageSteps.slice(0, 4).map((item, index) => {
                          const commands = buildOpsCommandTemplates(item.step, currentIteration?.projectId ?? 1, opsTemplates);
                          return (
                            <li key={`${item.step}-${index}`} className="history-item">
                              <strong>步骤 {index + 1}</strong>
                              <p>{item.step}</p>
                              <p className="hint">期望信号：{item.expectedSignal || "-"}</p>
                              <p className="hint">失败回退：{item.fallback || "-"}</p>
                              <p className="hint">建议命令：{commands.join("  |  ")}</p>
                              <div className="chat-tools">
                                <button
                                  type="button"
                                  className="btn ghost mini"
                                  onClick={async () => {
                                    const payload = [
                                      `排障步骤：${item.step}`,
                                      `期望信号：${item.expectedSignal || "-"}`,
                                      `失败回退：${item.fallback || "-"}`,
                                      "建议命令：",
                                      ...commands
                                    ].join("\n");
                                    await copyText(payload);
                                    setOpsCopyNotice(`已复制步骤 ${index + 1} 的排障内容。`);
                                  }}
                                >
                                  复制该步骤
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    <div className="info-box">
                      <h3>排障模板配置（项目级）</h3>
                      {templateNotice ? <p className="hint">{templateNotice}</p> : null}
                      <label className="hint">
                        类别
                        <input value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} placeholder="如：db/network/cache" />
                      </label>
                      <label className="hint">
                        关键词（每行一项）
                        <textarea
                          rows={3}
                          value={templateKeywordsText}
                          onChange={(event) => setTemplateKeywordsText(event.target.value)}
                          placeholder={"例如：\n数据库\ndb\n连接超时"}
                        />
                      </label>
                      <label className="hint">
                        命令模板（每行一条，支持 {"{{projectId}}/{{apiBase}}/{{backendDir}}"}）
                        <textarea
                          rows={4}
                          value={templateCommandsText}
                          onChange={(event) => setTemplateCommandsText(event.target.value)}
                          placeholder={"例如：\ncurl -sS {{apiBase}}/api/ops/runtime\ncd {{backendDir}} && PROJECT_ID={{projectId}} npm run ops:rollback"}
                        />
                      </label>
                      <label className="hint">
                        说明
                        <input value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} placeholder="模板用途说明" />
                      </label>
                      <div className="chat-tools">
                        <button
                          type="button"
                          className="btn ghost mini"
                          disabled={templateBusy}
                          onClick={async () => {
                            const keywords = parseLines(templateKeywordsText);
                            const commands = parseLines(templateCommandsText);
                            if (keywords.length === 0 || commands.length === 0) {
                              setTemplateNotice("请至少填写 1 条关键词与 1 条命令。");
                              return;
                            }
                            setTemplateBusy(true);
                            try {
                              await upsertOpsTriageTemplate({
                                projectId: currentIteration?.projectId,
                                category: templateCategory.trim() || "custom",
                                keywords,
                                commands,
                                note: templateNote
                              });
                              await reloadOpsTemplates();
                              setTemplateNotice("模板已保存。");
                              setTemplateKeywordsText("");
                              setTemplateCommandsText("");
                              setTemplateNote("");
                            } finally {
                              setTemplateBusy(false);
                            }
                          }}
                        >
                          保存模板
                        </button>
                      </div>
                      {(opsTemplates.filter((item) => item.source === "custom").length ?? 0) > 0 ? (
                        <ul className="history-list">
                          {opsTemplates
                            .filter((item) => item.source === "custom")
                            .slice(0, 8)
                            .map((item) => (
                              <li key={item.id} className="history-item">
                                <strong>{item.category}</strong>
                                <p className="hint">关键词：{item.keywords.join("；")}</p>
                                <p className="hint">命令：{item.commands.join("  |  ")}</p>
                                <div className="chat-tools">
                                  <button
                                    type="button"
                                    className="btn ghost mini"
                                    disabled={templateBusy}
                                    onClick={async () => {
                                      setTemplateBusy(true);
                                      try {
                                        await deleteOpsTriageTemplate(item.id);
                                        await reloadOpsTemplates();
                                        setTemplateNotice("模板已删除。");
                                      } finally {
                                        setTemplateBusy(false);
                                      }
                                    }}
                                  >
                                    删除
                                  </button>
                                </div>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="hint">当前项目暂无自定义排障模板。</p>
                      )}
                    </div>
                    {opsCopyNotice ? <p className="hint">{opsCopyNotice}</p> : null}
                    <p className="hint">{opsTriage.rollbackSuggestion}</p>
                  </div>
                ) : null}
                {showAdvancedReportSections && versionDiffDetailed ? (
                  <div className="info-box">
                    <h3>版本差异细化评估</h3>
                    <p>{versionDiffDetailed.summary}</p>
                    {(versionDiffDetailed.impactScope?.length ?? 0) > 0 ? (
                      <p className="hint">影响面：{versionDiffDetailed.impactScope.join("；")}</p>
                    ) : null}
                    {(versionDiffDetailed.riskPoints?.length ?? 0) > 0 ? (
                      <p className="hint">高风险点：{versionDiffDetailed.riskPoints.join("；")}</p>
                    ) : null}
                  </div>
                ) : null}
                {hasBaselineComparison ? (
                  <>
                    <div className="info-box">
                      <h3>版本差异（对比上个版本）</h3>
                      <p>基线版本：{analysisReport.versionDiff.baselineIterationName}</p>
                      <p>新增：{diffAdded.join("、") || "无"}</p>
                      <p>变化：{diffChanged.join("、") || "无"}</p>
                      <p>移除：{diffRemoved.join("、") || "无"}</p>
                    </div>
                    <div className="info-box">
                      <h3>差异定位（与上个版本）</h3>
                      {diffLocations.length === 0 ? (
                        <p>未检测到结构化差异。</p>
                      ) : (
                        <ul className="history-list">
                          {diffLocations.map((item, index) => (
                            <li key={`${item.dimension}-${item.changeType}-${item.currentItem}-${index}`} className="history-item">
                              <strong>{item.dimension}</strong>
                              <p>
                                {item.changeType === "added" ? "新增" : item.changeType === "removed" ? "移除" : "变更"}：
                                {item.baselineItem ? `${item.baselineItem} -> ` : ""}
                                {item.currentItem}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="info-box">
                    <h3>版本差异（对比上个版本）</h3>
                    <p className="hint">当前为首个版本或无可比较基线。</p>
                  </div>
                )}
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
            )}
          </div>
        </article>
      </aside>

      <div
        className={`analysis-drawer-mask interaction-drawer-mask ${showInteractionPanel ? "open" : ""}`}
        onClick={() => setShowInteractionPanel(false)}
        aria-hidden={!showInteractionPanel}
      />
      <aside
        className={`panel interaction-drawer ${showInteractionPanel ? "open" : ""}`}
        style={{ width: `min(${interactionDrawerWidth}px, 100vw)` }}
      >
        <article className="analysis-drawer-inner" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="interaction-drawer-resize-handle"
            aria-label="拖拽调整面板宽度"
            title="拖拽调整面板宽度"
            onPointerDown={handleInteractionDrawerResizePointerDown}
          />
          <div className="panel-head">
            <h2>交互界面</h2>
            <div className="chat-tools">
              <button
                type="button"
                className={`icon-btn ${interactionEditMode ? "is-active" : ""}`}
                aria-label={interactionEditMode ? "退出编辑模式" : "进入编辑模式"}
                title={interactionEditMode ? "退出编辑模式" : "编辑"}
                onClick={() => setInteractionEditMode((prev) => !prev)}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.5L9.8 5.3L13.5 7L9.8 8.8L8 12.5L6.2 8.8L2.5 7L6.2 5.3L8 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="btn ghost mini" onClick={() => setShowInteractionPanel(false)}>
                收起界面
              </button>
            </div>
          </div>
          <div className={`preview-scroll interaction-scroll ${hasRichInteractionPreview ? "is-rich-preview" : "is-legacy-preview"}`}>
            {htmlPrototypePreviews.length > 0 && selectedHtmlPreview ? (
              <div className="interaction-preview-grid">
                <div className="interaction-canvas-wrap">
                  <iframe
                    ref={htmlPreviewFrameRef}
                    title={`html-preview-${selectedHtmlPreview.name}`}
                    className="interaction-html-preview"
                    sandbox="allow-scripts allow-forms allow-modals allow-popups"
                    srcDoc={instrumentedHtmlPreview}
                  />
                  {interactionEditMode ? (
                    <div className="interaction-inline-editor">
                      <span className="interaction-target-chip">{selectedHtmlElement?.tag || "未选中元素"}</span>
                      <input
                        value={interactionInstruction}
                        onChange={(event) => setInteractionInstruction(event.target.value)}
                        placeholder="描述想修改的逻辑或样式"
                      />
                      <button
                        type="button"
                        className="btn primary mini"
                        onClick={() => {
                          void sendInteractionInstruction(interactionInstruction);
                          setInteractionInstruction("");
                        }}
                        disabled={!interactionInstruction.trim() || !selectedHtmlElement}
                      >
                        发送
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        onClick={handleUndoHtmlPreview}
                        disabled={htmlPreviewHistory.length === 0}
                      >
                        撤销上一步
                      </button>
                      <button type="button" className="btn ghost mini" onClick={() => setInteractionInstruction("")}>
                        清空
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : imagePrototypePreviews.length > 0 && selectedImagePreview ? (
              <div className="interaction-preview-grid">
                <div className="interaction-canvas-wrap">
                  <div className="info-box">
                    <h3>截图预览</h3>
                    <div className="interaction-tree-elements">
                      {imagePrototypePreviews.map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          className={`btn ghost mini ${selectedImagePreview.path === item.path ? "is-active" : ""}`}
                          onClick={() => {
                            setSelectedImagePreviewPath(item.path);
                            setSelectedImagePoint(null);
                            setSelectedImageRegion(null);
                          }}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                    <p className="hint">当前截图：{selectedImagePreview.path}</p>
                    <p className="hint">支持单击点选与拖拽框选区域，均可作为 IM 修改指令的目标锚点。</p>
                  </div>
                  <button
                    ref={imageWrapRef}
                    type="button"
                    className={`interaction-image-wrap ${interactionEditMode ? "is-editing" : ""}`}
                    onPointerDown={handleImagePointerDown}
                    onPointerMove={handleImagePointerMove}
                    onPointerUp={handleImagePointerUp}
                    onPointerCancel={handleImagePointerCancel}
                  >
                    <img className="interaction-image-preview" src={selectedImagePreview.dataUrl} alt={selectedImagePreview.name} />
                    {selectedImageRegion ? (
                      <span
                        className="interaction-image-region"
                        style={{
                          left: `${selectedImageRegion.xPercent}%`,
                          top: `${selectedImageRegion.yPercent}%`,
                          width: `${selectedImageRegion.widthPercent}%`,
                          height: `${selectedImageRegion.heightPercent}%`
                        }}
                      />
                    ) : null}
                    {dragImageRegion ? (
                      <span
                        className="interaction-image-region is-dragging"
                        style={{
                          left: `${dragImageRegion.xPercent}%`,
                          top: `${dragImageRegion.yPercent}%`,
                          width: `${dragImageRegion.widthPercent}%`,
                          height: `${dragImageRegion.heightPercent}%`
                        }}
                      />
                    ) : null}
                    {selectedImagePoint ? (
                      <span
                        className="interaction-image-point"
                        style={{ left: `${selectedImagePoint.xPercent}%`, top: `${selectedImagePoint.yPercent}%` }}
                      />
                    ) : null}
                  </button>
                  {interactionEditMode ? (
                    <div className="interaction-inline-editor">
                      <span className="interaction-target-chip">{selectedImageRegion ? "区域" : selectedImagePoint ? "点位" : "未选中"}</span>
                      <input
                        value={interactionInstruction}
                        onChange={(event) => setInteractionInstruction(event.target.value)}
                        placeholder={imageSelectionSummary || "先点选或框选，再描述想修改的逻辑或样式"}
                      />
                      <button
                        type="button"
                        className="btn primary mini"
                        onClick={() => {
                          sendInteractionInstruction(interactionInstruction);
                          setInteractionInstruction("");
                        }}
                        disabled={!interactionInstruction.trim() || (!selectedImageRegion && !selectedImagePoint)}
                      >
                        发送
                      </button>
                      <button type="button" className="btn ghost mini" onClick={() => setInteractionInstruction("")}>
                        清空
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <div className="interaction-tree">
                  {Object.entries(prototypeTree).map(([pageName, componentMap]) => (
                    <div key={pageName} className="interaction-tree-group">
                      <p className="hint">页面：{pageName}</p>
                      {Object.entries(componentMap).map(([componentName, elements]) => (
                        <div key={`${pageName}-${componentName}`} className="interaction-tree-node">
                          <p className="hint">组件：{componentName}</p>
                          <div className="interaction-tree-elements">
                            {elements.map((element) => (
                              <button
                                key={element.id}
                                type="button"
                                className={`btn ghost mini ${selectedPrototypeElementId === element.id ? "is-active" : ""}`}
                                onClick={() => setSelectedPrototypeElementId(element.id)}
                              >
                                {element.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="interaction-canvas-wrap">
                  <div className="interaction-canvas">
                    {prototypeElements
                      .filter((item) => item.visible)
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`interaction-element ${selectedPrototypeElementId === item.id ? "selected" : ""}`}
                          style={{
                            background: item.background,
                            color: item.color,
                            fontWeight: item.emphasized ? 700 : 500,
                            width: `${item.width}px`,
                            minHeight: `${item.height}px`
                          }}
                          onClick={() => setSelectedPrototypeElementId(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                  </div>
                  <div className="info-box">
                    <h3>属性面板</h3>
                    <p>当前选中：{selectedPrototypeElement?.label || "未选中元素"}</p>
                    <p className="hint">页面：{selectedPrototypeElement?.page || "-"}</p>
                    <p className="hint">组件：{selectedPrototypeElement?.component || "-"}</p>
                    <p className="hint">尺寸：{selectedPrototypeElement ? `${selectedPrototypeElement.width} × ${selectedPrototypeElement.height}` : "-"}</p>
                    <div className="chat-tools">
                      <button
                        type="button"
                        className="btn ghost mini"
                        onClick={() =>
                          selectedPrototypeElement &&
                          setPrototypeElements((prev) =>
                            prev.map((item) => (item.id === selectedPrototypeElement.id ? { ...item, visible: !item.visible } : item))
                          )
                        }
                      >
                        {selectedPrototypeElement?.visible ? "隐藏元素" : "显示元素"}
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        onClick={() =>
                          selectedPrototypeElement &&
                          setPrototypeElements((prev) =>
                            prev.map((item) => (item.id === selectedPrototypeElement.id ? { ...item, emphasized: !item.emphasized } : item))
                          )
                        }
                      >
                        {selectedPrototypeElement?.emphasized ? "取消强调" : "强调元素"}
                      </button>
                      <button
                        type="button"
                        className="btn ghost mini"
                        disabled={prototypeHistory.length === 0}
                        onClick={() => {
                          const latest = prototypeHistory[0];
                          if (!latest) {
                            return;
                          }
                          setPrototypeElements((prev) => prev.map((item) => (item.id === latest.targetId ? latest.before : item)));
                          setPrototypeHistory((prev) => prev.slice(1));
                          setPrototypeLastPlan([`已撤销：${latest.summary}`]);
                        }}
                      >
                        撤销上一步
                      </button>
                    </div>
                    <p className="hint">在 IM 输入框中描述修改并发送。示例：文案改为“提交审批”、改成绿色、宽 520、高 56、隐藏、变大。</p>
                    {prototypeLastPlan.length > 0 ? (
                      <>
                        <p className="hint">解析预览：</p>
                        <ul className="history-list">
                          {prototypeLastPlan.map((item) => (
                            <li key={item} className="history-item">
                              <p>{item}</p>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {prototypeHistory.length > 0 ? (
                      <>
                        <p className="hint">最近变更：</p>
                        <ul className="history-list">
                          {prototypeHistory.slice(0, 3).map((item) => (
                            <li key={item.id} className="history-item">
                              <p>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} · {item.summary}</p>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </article>
      </aside>

    </>
  );
}
