import type { ArtifactReferenceMessage } from "../../app/workspaceChatMessagePresentation";
import {
  compactArtifactCardSummary,
  parseArtifactReferenceMessage,
} from "../../app/workspaceChatMessagePresentation";
import { buildAnalysisArtifactPreview } from "./analysisArtifactPresenter";
import { resolveArtifactPreviewKind } from "./iterationWorkspacePanelUtils";
import type {
  IterationMessage,
  IterationStatus,
  IterationArtifactStage,
} from "./iterationWorkspacePanelTypes";
import type { IterationArtifactWorkflowItem } from "../../domain/workspace/iterationTypes";

/* ── role / avatar ── */

export const getRoleLabel = (role: IterationMessage["role"]): string =>
  role === "user" ? "我" : role === "assistant" ? "BuildWise AI" : "系统";

export const getRoleAvatar = (role: IterationMessage["role"]): string =>
  role === "user" ? "我" : role === "assistant" ? "AI" : "系";

/* ── message kind / theme ── */

export const getMsgKind = (msg: IterationMessage): string => {
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

export const getMsgTheme = (msg: IterationMessage): string => {
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

/* ── formatting ── */

export const formatTime = (value: string): string =>
  new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

const statusLabelMap: Record<IterationStatus, string> = {
  planned: "规划中",
  "in-progress": "进行中",
  review: "评审中",
  blocked: "阻塞中",
  completed: "已完成",
};

export const renderStatusLabel = (status: IterationStatus): string =>
  statusLabelMap[status] ?? status;

/* ── string helpers ── */

export const parseLines = (value: string): string[] =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

export const copyText = async (text: string): Promise<void> => {
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

/* ── guidance / deliverable ── */

export const resolveGuidanceText = (content: string): string => {
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

export const resolveDeliverableCardData = (
  content: string,
  artifactItems: IterationArtifactWorkflowItem[],
): ArtifactReferenceMessage | null => {
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
      evidence: deliverable.evidence.length > 0 ? deliverable.evidence : matchedArtifact.evidence || [],
    };
  }
  const preview = buildAnalysisArtifactPreview(matchedArtifact.draft?.content || "");
  return {
    ...deliverable,
    summary: compactArtifactCardSummary(preview.summary || matchedArtifact.summary || deliverable.summary, deliverable.summary),
    evidence: preview.evidence.length > 0 ? preview.evidence : deliverable.evidence,
  };
};

export const findPreferredArtifactForStage = (
  stage: IterationArtifactStage,
  artifactItems: IterationArtifactWorkflowItem[],
): IterationArtifactWorkflowItem | null =>
  artifactItems.find((item) => item.stage === stage) || artifactItems[0] || null;
