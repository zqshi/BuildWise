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

export function normalizeRichTextContent(value: string) {
  const text = value.trim();
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
  const text = value.trim();
  if (!text) {
    return "markdown" as const;
  }
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return "html" as const;
  }
  return "markdown" as const;
}

export function stripRichTextToPlainText(value: string) {
  if (!value.trim()) {
    return "";
  }
  return value
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
  const summary = stripRichTextToPlainText(value || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
  return summary || fallbackSummary;
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
