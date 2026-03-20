import { extractArtifactDisplayContent, extractDeliverableTitleFromContent, isStructuredArtifactContent } from "./artifactContentPresentation";

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
  const joined = lines.join("\n");

  // 检测是否为结构化交付物内容（包含 markdown 表格、标题等）
  if (!isStructuredArtifactContent(joined)) {
    return joined;
  }

  // 提取交付物标题
  const title = extractDeliverableTitle(lines) || extractDeliverableTitleFromContent(joined);
  if (!title) {
    // 有结构化信号但无法识别交付物标题，保留自然语言行
    const naturalLines = lines.filter((line) => isNaturalLanguageConfirmationLine(line) || (!STRUCTURED_ARTIFACT_SIGNAL.test(line) && !DELIVERABLE_READY_LINE.test(line)));
    return naturalLines.length > 0 ? naturalLines.join("\n") : joined;
  }

  // 提取确认引导行（自然语言部分）
  const confirmationLines = lines.filter((line) => isNaturalLanguageConfirmationLine(line));
  const readyLine = lines.find((line) => DELIVERABLE_READY_LINE.test(line));
  const notice = readyLine || `已生成「${title}」。`;
  const guidance = confirmationLines.length > 0 ? confirmationLines.join("\n") : "请查看交付物卡片并确认。";

  return `${notice}\n${guidance}`;
}
