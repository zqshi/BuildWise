const ARTIFACT_REFERENCE_PREFIX = "【交付物引用】";

function parseArtifactReferenceContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed.startsWith(ARTIFACT_REFERENCE_PREFIX)) {
    return null;
  }
  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }
  const title = lines[0].replace(ARTIFACT_REFERENCE_PREFIX, "").trim() || "交付物";
  const prompt = lines.find((line) => line.startsWith("请基于") || line.startsWith("请围绕") || line.startsWith("请查看")) || "";
  return { title, prompt };
}

// ---------------------------------------------------------------------------
// 技术字段过滤：去除 system/assistant 消息中的内部字段路径和 JSON 片段
// ---------------------------------------------------------------------------

/** 匹配 key=value 格式的内部字段路径，如 deep.cross.rootCauses=xxx */
const FIELD_PATH_PATTERN = /\b(?:deep|necessity|iteration|evidenceRefs|coreIntent|successCriteria|prioritizedFindings|clarificationQuestions|sourceType)\b[.\w]*=[^\n]*/g;

/** 匹配独立的 JSON 块 */
const JSON_BLOCK_PATTERN = /\{[^{}]*"(?:publishable|score|missingItems|actionRequired)"[^{}]*\}/g;

/** 匹配被 ```json 包裹的代码块 */
const CODE_BLOCK_PATTERN = /```json[\s\S]*?```/g;

/** 匹配内部审计标记如 <!-- coach:{...} --> */
const INTERNAL_TAG_PATTERN = /<!--\s*coach:\{[\s\S]*?\}\s*-->/g;

function stripTechnicalContent(text: string): string {
  return text
    .replace(CODE_BLOCK_PATTERN, "")
    .replace(JSON_BLOCK_PATTERN, "")
    .replace(FIELD_PATH_PATTERN, "")
    .replace(INTERNAL_TAG_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 清洗 system/assistant 消息中的技术内容，供教练对话上下文注入使用。
 * 移除内部字段路径（deep.cross.xxx=）、JSON 结构、代码块、审计标记。
 */
export function sanitizeForCoachContext(content: string): string {
  return stripTechnicalContent(content);
}

// ---------------------------------------------------------------------------
// 用户消息标准化（交付物引用处理）
// ---------------------------------------------------------------------------

export function normalizeIterationMessageContent(role: "system" | "assistant" | "user", content: string) {
  const trimmed = content.trim();
  if (role === "system" || role === "assistant") {
    return stripTechnicalContent(trimmed);
  }
  const parsed = parseArtifactReferenceContent(trimmed);
  if (!parsed) {
    return trimmed;
  }
  if (/^请围绕交付物/.test(parsed.prompt)) {
    return parsed.prompt
      .replace(/继续与用户确认/g, "继续与我确认")
      .replace(/，?不要直接跨阶段推进。?$/g, "。")
      .trim();
  }
  if (/^请基于该交付物/.test(parsed.prompt)) {
    return parsed.prompt.replace(/^请基于该交付物/, `请基于交付物「${parsed.title}」`).trim();
  }
  return `请基于交付物「${parsed.title}」继续与我确认需要调整的内容。`;
}
