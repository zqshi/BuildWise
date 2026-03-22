import { extractArtifactDisplayContent, extractDeliverableTitleFromContent, isStructuredArtifactContent } from "./artifactContentPresentation.ts";

const INTERNAL_SKILL_LINE = /^\s*\[skills\]/i;
// 容错：标准闭合、未闭合（LLM截断）、大小写
const COACH_MARKER_RE = /<!--\s*coach:\s*\{[\s\S]*?\}\s*(?:-->|$)/i;
const DELIVERABLE_READY_LINE = /(已输出|已生成|已整理|已形成).*(报告|文档|交付物|边界确认)/;
function normalizeLines(reply: string) {
  return extractArtifactDisplayContent(reply)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !INTERNAL_SKILL_LINE.test(line));
}

function isNaturalLanguageLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // 结构化行：markdown表格、标题、列表项、代码块、分隔线
  if (/^(#{1,6}\s|\|.+\|$|```|---+$)/.test(trimmed)) return false;
  // 表格分隔行
  if (/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(trimmed)) return false;
  return true;
}

/**
 * 展示 Coach 回复：
 * - 保留 AI 的自然语言引导和说明（用户在气泡中看到）
 * - 剥离结构化交付物正文（markdown表格/标题等，走卡片通道展示）
 * - 剥离内部标记（skill notes、coach marker）
 *
 * 设计原则：用户同时看到 AI 的对话性回复（气泡）和交付物详情（卡片），
 * 而不是只看到一行"已生成「XX」"的通知。
 */
export function presentCoachReply(reply: string) {
  if (!reply) {
    return "";
  }
  // 剥离尾部的 <!-- coach:{...} --> 结构化控制标记
  const withoutMarker = reply.replace(COACH_MARKER_RE, "").trim();
  const lines = normalizeLines(withoutMarker);
  if (lines.length === 0) {
    return "";
  }
  const joined = lines.join("\n");

  // 如果回复中没有结构化交付物内容，直接完整返回
  if (!isStructuredArtifactContent(joined)) {
    return joined;
  }

  // 有结构化交付物内容：提取自然语言行保留在气泡中
  // 结构化部分（表格、markdown标题等）交给卡片通道展示
  const naturalLines = lines.filter((line) => isNaturalLanguageLine(line));

  if (naturalLines.length === 0) {
    // 全是结构化内容，生成一句简短引导
    const title = extractDeliverableTitleFromContent(joined);
    const readyLine = lines.find((line) => DELIVERABLE_READY_LINE.test(line));
    return readyLine || (title ? `已生成「${title}」，请查看交付物卡片了解详情。` : joined);
  }

  return naturalLines.join("\n");
}
