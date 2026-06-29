const INTERNAL_SKILL_LINE = /^\s*\[skills\]/i;
const STRUCTURED_ARTIFACT_SIGNAL = /(^#{1,4}\s)|(^\|.+\|$)|(^[-*]\s)|(^\d+\.\d+\s)|(^```)|(^---$)/m;
const DELIVERABLE_TITLE_SIGNAL = /(首版需求分析报告|继承差异分析报告|需求分析报告|产品需求文档|边界确认|设计规范|技术架构|代码交付|测试矩阵|发布评审|交付归档)/;
const STRUCTURED_ARTIFACT_KEYS = ["reply", "content", "body", "markdown", "html", "text"] as const;

function decodeStructuredText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!trimmed.includes("\\") || (trimmed.includes("\n") && !trimmed.includes("\\n"))) {
    return trimmed;
  }
  return trimmed
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function unwrapSingleCodeFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```[a-z0-9_-]*\s*\n([\s\S]*?)\n```$/i);
  if (match) {
    return match[1].trim();
  }
  const openFenceMatch = trimmed.match(/^```([a-z0-9_-]*)\s*\n([\s\S]*)$/i);
  if (!openFenceMatch) {
    return trimmed;
  }
  const [, language = "", body = ""] = openFenceMatch;
  const normalizedLanguage = language.trim().toLowerCase();
  const candidate = body.trim();
  if (normalizedLanguage && !["json", "javascript", "js", "typescript", "ts", "text", "txt"].includes(normalizedLanguage)) {
    return trimmed;
  }
  if (/^\s*[\[{]/.test(candidate) || /"\s*(?:reply|content|body|markdown|html|text)\s*"\s*:/.test(candidate)) {
    return candidate.replace(/\n```$/i, "").trim();
  }
  return trimmed;
}

function extractQuotedJsonField(text: string, key: string) {
  const keyIndex = text.indexOf(`"${key}"`);
  if (keyIndex < 0) {
    return "";
  }
  const colonIndex = text.indexOf(":", keyIndex);
  if (colonIndex < 0) {
    return "";
  }
  let cursor = colonIndex + 1;
  while (cursor < text.length && /\s/.test(text.charAt(cursor))) {
    cursor += 1;
  }
  if (text.charAt(cursor) !== '"') {
    return "";
  }
  cursor += 1;
  let raw = "";
  let escaped = false;
  for (; cursor < text.length; cursor += 1) {
    const char = text.charAt(cursor);
    if (escaped) {
      raw += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      try {
        return JSON.parse(`"${raw}"`) as string;
      } catch {
        return raw;
      }
    }
    raw += char;
  }
  if (!raw.trim()) {
    return "";
  }
  try {
    return JSON.parse(`"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`) as string;
  } catch {
    return raw
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }
}

function parseJsonObjectFromText(value: string) {
  const text = value.trim();
  if (!text) {
    return null;
  }
  const candidates = [text, unwrapSingleCodeFence(text)];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      const start = candidate.indexOf("{");
      const end = candidate.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
        } catch {
          // JSON parse fallback failed, continue to next candidate
        }
      }
    }
  }
  return null;
}

function pickStructuredArtifactBody(parsed: Record<string, unknown> | null) {
  if (!parsed) {
    return "";
  }
  for (const key of STRUCTURED_ARTIFACT_KEYS) {
    const value = parsed[key];
    if (typeof value === "string" && value.trim()) {
      return decodeStructuredText(value);
    }
  }
  return "";
}

function extractStructuredFieldFromText(value: string) {
  const text = unwrapSingleCodeFence(value.trim());
  for (const key of STRUCTURED_ARTIFACT_KEYS) {
    const extracted = extractQuotedJsonField(text, key);
    if (extracted.trim()) {
      return decodeStructuredText(extracted);
    }
  }
  return "";
}

function stripHtmlToText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripMarkdownDecoration(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function isSkippableSummaryLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  if (INTERNAL_SKILL_LINE.test(trimmed)) {
    return true;
  }
  if (/^```/.test(trimmed) || /^---+$/.test(trimmed)) {
    return true;
  }
  if (/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(trimmed)) {
    return true;
  }
  return false;
}

function extractArtifactDisplayContentInternal(value: string, depth: number): string {
  if (depth > 3) {
    return value;
  }
  const text = value.trim();
  if (!text) {
    return "";
  }
  const parsed = parseJsonObjectFromText(text);
  const extracted = pickStructuredArtifactBody(parsed);
  if (extracted && extracted !== text) {
    return extractArtifactDisplayContentInternal(extracted, depth + 1);
  }
  const fallbackExtracted = extractStructuredFieldFromText(text);
  if (fallbackExtracted && fallbackExtracted !== text) {
    return extractArtifactDisplayContentInternal(fallbackExtracted, depth + 1);
  }
  return value;
}

export function extractArtifactDisplayContent(value: string) {
  return extractArtifactDisplayContentInternal(value, 0);
}

export function normalizeArtifactPlainText(value: string) {
  const normalized = extractArtifactDisplayContent(value).trim();
  if (!normalized) {
    return "";
  }
  const plain = /<[a-z][\s\S]*>/i.test(normalized) ? stripHtmlToText(normalized) : normalized;
  return plain.replace(/\r\n/g, "\n").trim();
}

export function extractDeliverableTitleFromContent(value: string) {
  const content = extractArtifactDisplayContent(value);
  const matched = content.match(DELIVERABLE_TITLE_SIGNAL);
  return matched?.[0] || "";
}

export function isStructuredArtifactContent(value: string) {
  const content = extractArtifactDisplayContent(value).trim();
  if (!content) {
    return false;
  }
  return STRUCTURED_ARTIFACT_SIGNAL.test(content) || (DELIVERABLE_TITLE_SIGNAL.test(content) && content.split("\n").length >= 4);
}

export function buildArtifactSummary(value: string, fallback = "", maxLines = 3) {
  const plain = normalizeArtifactPlainText(value);
  const lines = plain
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !isSkippableSummaryLine(line));
  if (lines.length === 0) {
    return fallback.trim();
  }
  const cleaned = lines.map((line) => stripMarkdownDecoration(line)).filter(Boolean);
  const titleLine = cleaned.find((line) => /^#/.test(line) || DELIVERABLE_TITLE_SIGNAL.test(line)) || "";
  const headingLines = cleaned.filter((line) => /^#/.test(line) && line !== titleLine);
  const proseLines = cleaned.filter((line) => !/^#/.test(line) && !line.startsWith("|"));
  const structuredLines = cleaned.filter((line) => line.startsWith("|"));
  const result: string[] = [];
  const pushUnique = (line: string) => {
    if (!line || result.includes(line)) {
      return;
    }
    result.push(line);
  };
  if (titleLine) {
    pushUnique(titleLine);
  }
  for (const line of headingLines) {
    if (result.length >= maxLines) {
      break;
    }
    pushUnique(line);
  }
  for (const line of proseLines) {
    if (result.length >= maxLines) {
      break;
    }
    pushUnique(line);
  }
  for (const line of structuredLines) {
    if (result.length >= maxLines) {
      break;
    }
    pushUnique(line);
  }
  if (result.length === 0) {
    cleaned.slice(0, maxLines).forEach(pushUnique);
  }
  return result.slice(0, maxLines).join("；") || fallback.trim();
}
