import { buildArtifactSummary, extractArtifactDisplayContent } from "../../app/artifactContentPresentation";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildEditorLineNumbers(value: string) {
  const total = Math.max(1, value.split("\n").length);
  return Array.from({ length: total }, (_, index) => index + 1);
}

export function summarizeArtifactText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = Math.max(1, normalized.split("\n").length);
  const chars = normalized.length;
  const words = normalized
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
  return { lines, chars, words };
}

export function extractArtifactDocumentContent(value: string) {
  return extractArtifactDisplayContent(value);
}

function extractHtmlCodeFence(value: string) {
  const matched = value.match(/```(?:html)?\s*\n([\s\S]*?)\n```/i);
  return matched?.[1]?.trim() || "";
}

function extractCompleteHtmlDocument(value: string) {
  const text = value.trim();
  if (!text) {
    return "";
  }
  const doctypeIndex = text.search(/<!doctype html/i);
  if (doctypeIndex >= 0) {
    return text.slice(doctypeIndex).trim();
  }
  const htmlOpenIndex = text.search(/<html[\s>]/i);
  const htmlCloseMatch = text.match(/<\/html>/i);
  if (htmlOpenIndex >= 0 && htmlCloseMatch && typeof htmlCloseMatch.index === "number" && htmlCloseMatch.index > htmlOpenIndex) {
    return text.slice(htmlOpenIndex, htmlCloseMatch.index + htmlCloseMatch[0].length).trim();
  }
  return "";
}

export function extractArtifactPrototypeHtml(value: string) {
  const text = extractArtifactDocumentContent(value).trim();
  if (!text) {
    return "";
  }
  const fencedHtml = extractHtmlCodeFence(text);
  if (fencedHtml) {
    return fencedHtml;
  }
  const completeHtml = extractCompleteHtmlDocument(text);
  if (completeHtml) {
    return completeHtml;
  }
  if (/^\s*<(?:!doctype html|html[\s>]|head[\s>]|body[\s>])/i.test(text)) {
    return text;
  }
  return "";
}

export type ArtifactDocumentProfile =
  | "prd"
  | "design-spec"
  | "technical-architecture"
  | "test-cases"
  | "release-review"
  | "delivery-package"
  | "generic";

export type ArtifactOutlineSection = {
  level: number;
  title: string;
  summary: string;
};

export type ArtifactMarkdownCodeBlock = {
  language: string;
  preview: string;
};

export type ArtifactMarkdownTable = {
  headers: string[];
  rows: string[][];
};

function stripMarkdownDecoration(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function toMarkdownLines(value: string) {
  return extractArtifactDocumentContent(value).replace(/\r\n/g, "\n").split("\n");
}

export function extractArtifactOutlineSections(value: string, max = 6): ArtifactOutlineSection[] {
  const lines = toMarkdownLines(value);
  const sections: ArtifactOutlineSection[] = [];
  let current: ArtifactOutlineSection | null = null;
  let inCodeFence = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) {
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (current) {
        sections.push(current);
      }
      current = {
        level: heading[1].length,
        title: stripMarkdownDecoration(heading[2]),
        summary: ""
      };
      if (sections.length >= max) {
        break;
      }
      continue;
    }
    if (!current || current.summary || !line) {
      continue;
    }
    current.summary = stripMarkdownDecoration(line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, ""));
  }
  if (current && sections.length < max) {
    sections.push(current);
  }
  return sections
    .filter((section) => section.title)
    .slice(0, max);
}

export function summarizeArtifactStructure(value: string) {
  const normalized = extractArtifactDocumentContent(value).replace(/\r\n/g, "\n");
  const headingCount = (normalized.match(/^#{1,6}\s+/gm) || []).length;
  const codeFenceCount = Math.floor((normalized.match(/^```/gm) || []).length / 2);
  const tableRowCount = (normalized.match(/^\|.+\|$/gm) || []).length;
  const checklistCount = (normalized.match(/^\s*[-*]\s+\[(?: |x|X)\]\s+/gm) || []).length;
  return {
    headingCount,
    codeFenceCount,
    tableRowCount,
    checklistCount
  };
}

export function extractArtifactMarkdownCodeBlocks(value: string, max = 4): ArtifactMarkdownCodeBlock[] {
  const lines = toMarkdownLines(value);
  const blocks: ArtifactMarkdownCodeBlock[] = [];
  let inCodeFence = false;
  let language = "";
  let buffer: string[] = [];
  for (const rawLine of lines) {
    const fenceMatch = rawLine.match(/^```([\w-]*)\s*$/);
    if (fenceMatch) {
      if (inCodeFence) {
        const preview = buffer
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join("\n");
        if (preview) {
          blocks.push({
            language: language || "text",
            preview
          });
        }
        if (blocks.length >= max) {
          break;
        }
        buffer = [];
        language = "";
        inCodeFence = false;
      } else {
        inCodeFence = true;
        language = fenceMatch[1]?.trim().toLowerCase() || "";
      }
      continue;
    }
    if (inCodeFence) {
      buffer.push(rawLine);
    }
  }
  return blocks.slice(0, max);
}

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => stripMarkdownDecoration(cell.trim()));
}

export function extractArtifactMarkdownTables(value: string, max = 2): ArtifactMarkdownTable[] {
  const lines = toMarkdownLines(value);
  const tables: ArtifactMarkdownTable[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const headerLine = lines[index]?.trim() || "";
    const separatorLine = lines[index + 1]?.trim() || "";
    if (!headerLine.startsWith("|") || !headerLine.endsWith("|") || !isMarkdownTableSeparator(separatorLine)) {
      continue;
    }
    const headers = splitMarkdownTableRow(headerLine);
    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const rowLine = lines[cursor]?.trim() || "";
      if (!rowLine.startsWith("|") || !rowLine.endsWith("|")) {
        break;
      }
      rows.push(splitMarkdownTableRow(rowLine));
      cursor += 1;
    }
    tables.push({ headers, rows });
    if (tables.length >= max) {
      break;
    }
    index = cursor - 1;
  }
  return tables;
}

export function normalizeRichTextContent(value: string) {
  const text = extractArtifactDocumentContent(value).trim();
  if (!text) {
    return "<p></p>";
  }
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return text;
  }
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function detectDocumentFormat(value: string) {
  const text = extractArtifactDocumentContent(value).trim();
  if (!text) {
    return "markdown" as const;
  }
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return "html" as const;
  }
  return "markdown" as const;
}

function isPipeTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return false;
  }
  return trimmed.split("|").length >= 4;
}

function isMarkdownTableSeparator(line: string) {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(line.trim());
}

function buildMarkdownTableSeparator(headerLine: string) {
  const columns = headerLine
    .trim()
    .slice(1, -1)
    .split("|")
    .map(() => " --- ");
  return `|${columns.join("|")}|`;
}

const pseudoHeadingLabels = new Set([
  "问题定义",
  "项目目标",
  "目标用户",
  "纳入范围",
  "排除项",
  "待确认",
  "确认点",
  "验收标准",
  "交互原则",
  "影响范围",
  "业务规则",
  "规则映射",
  "风险",
  "边界风险",
  "交付说明",
  "回滚策略",
  "技术方案",
  "数据流",
  "接口边界"
]);

function normalizePseudoListLine(line: string) {
  if (/^\s*\d+[)）]\s*/.test(line)) {
    return line.replace(/^(\s*)?(\d+)[)）]\s*/, "$1$2. ");
  }
  if (/^\s*[•·●]\s+/.test(line)) {
    return line.replace(/^(\s*)[•·●]\s+/, "$1- ");
  }
  if (/^\s*—\s+/.test(line)) {
    return line.replace(/^(\s*)—\s+/, "$1- ");
  }
  return line;
}

function normalizePseudoTaskLine(line: string) {
  const match = line.match(/^(\s*[-*]\s)\[( |x|X)\]\s+(.+)$/);
  if (!match) {
    return line;
  }
  const checked = match[2].toLowerCase() === "x";
  const label = escapeHtml(match[3].trim());
  return `${match[1]}<span class="artifact-task-item${checked ? " is-checked" : ""}"><input type="checkbox" disabled ${checked ? "checked" : ""} /><span>${label}</span></span>`;
}

function normalizePseudoHeadingLine(line: string, previousLine: string) {
  const match = line.match(/^([^:：]{2,20})[:：]\s*(.+)$/);
  if (!match) {
    return line;
  }
  const [, label, content] = match;
  if (!pseudoHeadingLabels.has(label) || previousLine.trim()) {
    return line;
  }
  return `## ${label}\n${content.trim()}`;
}

function normalizePseudoSectionHeadingLine(line: string, previousLine: string) {
  const trimmed = line.trim();
  if (previousLine.trim()) {
    return line;
  }
  if (/^\d+(?:\.\d+){1,3}\s+.+$/.test(trimmed)) {
    return `### ${trimmed}`;
  }
  return line;
}

function looksLikeCodeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^(const|let|var|function|return|if|for|while|class|interface|type|import|export)\b/.test(trimmed)) {
    return true;
  }
  if (/^(<[/a-zA-Z][^>]*>|<\/[a-zA-Z]+>)/.test(trimmed)) {
    return true;
  }
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(curl|npm|pnpm|yarn|git|node)\b/.test(trimmed)) {
    return true;
  }
  if (/^\s{2,}[\w"'`[\]]+/.test(line)) {
    return true;
  }
  if (/[;{},]$/.test(trimmed)) {
    return true;
  }
  return /^[{[]|^[}\]]$/.test(trimmed);
}

function detectCodeFenceLanguage(line: string) {
  const trimmed = line.trim();
  if (/^(const|let|var|function|return|if|for|while|class|interface|type|import|export)\b/.test(trimmed)) {
    return "ts";
  }
  if (/^(<[/a-zA-Z][^>]*>|<\/[a-zA-Z]+>)/.test(trimmed)) {
    return "html";
  }
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/i.test(trimmed)) {
    return "sql";
  }
  if (/^(curl|npm|pnpm|yarn|git|node)\b/.test(trimmed)) {
    return "bash";
  }
  return "";
}

function normalizePseudoCodeBlocks(lines: string[]) {
  const normalized: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const current = lines[index];
    if (/^\s*```/.test(current)) {
      normalized.push(current);
      index += 1;
      continue;
    }
    const previous = lines[index - 1] || "";
    if (!previous.trim() && looksLikeCodeLine(current)) {
      const block: string[] = [];
      let cursor = index;
      while (cursor < lines.length && (looksLikeCodeLine(lines[cursor]) || /^\s*$/.test(lines[cursor]))) {
        block.push(lines[cursor]);
        cursor += 1;
      }
      while (block.length > 0 && !block[block.length - 1]?.trim()) {
        block.pop();
      }
      const contentLines = block.filter((line) => line.trim());
      if (contentLines.length >= 2) {
        const language = detectCodeFenceLanguage(contentLines[0] || "");
        normalized.push(`\`\`\`${language}`);
        normalized.push(...block);
        normalized.push("```");
        index = cursor;
        continue;
      }
    }
    normalized.push(current);
    index += 1;
  }
  return normalized;
}

export function normalizeMarkdownForPreview(value: string) {
  const lines = extractArtifactDocumentContent(value).replace(/\r\n/g, "\n").split("\n");
  const normalizedLines: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const previousLine = lines[index - 1] || "";
    let currentLine = lines[index];
    currentLine = normalizePseudoListLine(currentLine);
    currentLine = normalizePseudoTaskLine(currentLine);
    currentLine = normalizePseudoHeadingLine(currentLine, previousLine);
    currentLine = normalizePseudoSectionHeadingLine(currentLine, previousLine);
    const nextLine = lines[index + 1] || "";
    normalizedLines.push(currentLine);
    if (isPipeTableRow(currentLine) && isPipeTableRow(nextLine)) {
      const previousIsTableRow = isPipeTableRow(previousLine);
      if (!previousIsTableRow && !isMarkdownTableSeparator(previousLine) && !isMarkdownTableSeparator(nextLine)) {
        normalizedLines.push(buildMarkdownTableSeparator(currentLine));
      }
    }
  }
  return normalizePseudoCodeBlocks(normalizedLines).join("\n");
}

export function stripRichTextToPlainText(value: string) {
  const normalizedValue = extractArtifactDocumentContent(value);
  if (!normalizedValue.trim()) {
    return "";
  }
  return normalizedValue
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectCodeLanguage(title: string, value: string) {
  const loweredTitle = title.toLowerCase();
  const loweredValue = value.toLowerCase();
  if (loweredTitle.includes("html") || /<\/?[a-z]/.test(loweredValue)) {
    return "html";
  }
  if (loweredTitle.includes("json") || loweredValue.trim().startsWith("{")) {
    return "json";
  }
  if (loweredTitle.includes("css") || /color:|display:|grid-template/.test(loweredValue)) {
    return "css";
  }
  if (loweredTitle.includes("ts") || loweredTitle.includes("typescript") || /\binterface\b|\btype\b|\bconst\b/.test(loweredValue)) {
    return "typescript";
  }
  if (loweredTitle.includes("js") || /\bfunction\b|\bexport\b/.test(loweredValue)) {
    return "javascript";
  }
  return "plaintext";
}

export function buildArtifactCommitSummary(value: string, fallbackSummary = "") {
  return buildArtifactSummary(value || "", fallbackSummary, 3);
}

export function buildArtifactRevisionPrompt(title: string, currentInput = "") {
  const prefix = `请调整交付物「${title}」：`;
  const normalized = currentInput.trim();
  if (!normalized) {
    return prefix;
  }
  if (normalized.startsWith(prefix)) {
    return normalized;
  }
  return `${prefix}\n${normalized}`;
}

export function shouldCloseDrawerAfterRevisionRequest() {
  return true;
}

export function resolveArtifactActionErrorMessage(error: unknown, fallback = "交付物操作失败，请稍后重试。") {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("artifact not found")) {
    return "当前交付物上下文已失效，已无法提交。请重新打开该交付物后再试。";
  }
  if (message.includes("API error: 404")) {
    return "未找到当前交付物。请刷新迭代数据后重新提交。";
  }
  return message.trim() || fallback;
}
