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

export function normalizeIterationMessageContent(role: "system" | "assistant" | "user", content: string) {
  const trimmed = content.trim();
  if (role !== "user") {
    return trimmed;
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
