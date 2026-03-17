import { extractArtifactDisplayContent, extractDeliverableTitleFromContent, isStructuredArtifactContent } from "./artifactContentPresentation.ts";

const INTERNAL_SKILL_LINE = /^\s*\[skills\]/i;
const DELIVERABLE_TITLE_LINE = /(首版需求分析报告|继承差异分析报告|需求分析报告|产品需求文档|边界确认|设计规范|技术架构|代码交付|测试矩阵|发布评审|交付归档)/;
const DELIVERABLE_READY_LINE = /(已输出|已生成|已整理|已形成).*(报告|文档|交付物|边界确认)/;
const STRUCTURED_ARTIFACT_SIGNAL = /(^#{1,4}\s)|(^\|.+\|$)|(^[-*]\s)|(^\d+\.\d+\s)|(^```)|(^---$)/m;

function normalizeLines(reply: string) {
  return extractArtifactDisplayContent(reply)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !INTERNAL_SKILL_LINE.test(line));
}

function extractDeliverableTitle(lines: string[]) {
  const matched = lines.find((line) => DELIVERABLE_TITLE_LINE.test(line));
  if (!matched) {
    return "";
  }
  const titleMatch = matched.match(DELIVERABLE_TITLE_LINE);
  return titleMatch?.[0] || "";
}

function isNaturalLanguageConfirmationLine(line: string) {
  if (!/确认|查看交付物|打开交付物|补充修改/.test(line)) {
    return false;
  }
  return !/^(#{1,6}\s|\|.+\|$|\d+\.\d+\s)/.test(line.trim());
}

export function presentCoachReply(reply: string) {
  const lines = normalizeLines(reply);
  if (lines.length === 0) {
    return "";
  }
  const firstLine = lines[0];
  const deliverableTitle = extractDeliverableTitle(lines) || extractDeliverableTitleFromContent(reply);
  const looksLikeDeliverableNotice =
    DELIVERABLE_READY_LINE.test(firstLine) ||
    (Boolean(deliverableTitle) && lines.length > 1) ||
    (Boolean(deliverableTitle) && lines.length >= 6 && STRUCTURED_ARTIFACT_SIGNAL.test(lines.join("\n"))) ||
    isStructuredArtifactContent(reply);
  if (!looksLikeDeliverableNotice) {
    return lines.join("\n");
  }
  const confirmationLine =
    lines.find((line, index) => index > 0 && isNaturalLanguageConfirmationLine(line)) ||
    "请直接查看交付物卡片并确认，若需调整可继续补充意见。";
  const noticeLine = DELIVERABLE_READY_LINE.test(firstLine)
    ? `${firstLine.replace(/[。；]\s*$/, "")}。`
    : `已生成${deliverableTitle || "交付物"}。`;
  return `${noticeLine}${confirmationLine}`;
}
