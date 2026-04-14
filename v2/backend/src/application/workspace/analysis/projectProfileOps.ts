import { parseJsonObjectFromText, pickString, pickStringList } from './extractors';

// LLM（尤其 DeepSeek）可能输出中文 key，建立中→英映射作为 fallback
function resolveKey(parsed: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!parsed) return undefined;
  for (const key of keys) {
    if (parsed[key] !== undefined) return parsed[key];
  }
  return undefined;
}

function resolveProjectDetection(parsed: Record<string, unknown> | null): Record<string, unknown> {
  if (!parsed) return {};
  // 先尝试英文 key
  if (parsed.projectDetection && typeof parsed.projectDetection === "object") {
    return parsed.projectDetection as Record<string, unknown>;
  }
  // fallback: 从中文 key 构造
  const projectName = resolveKey(parsed, "projectName", "项目名称") as string | undefined;
  const productName = resolveKey(parsed, "productName", "产品名称") as string | undefined;
  const projectCategory = resolveKey(parsed, "projectCategory", "项目类别", "项目类型") as string | undefined;
  const evidence = resolveKey(parsed, "evidence", "依据", "证据") as unknown[] | undefined;
  if (projectName || productName) {
    return { projectName, productName, projectCategory, evidence };
  }
  return {};
}

function resolveMeaningfulFindings(parsed: Record<string, unknown> | null): unknown {
  return resolveKey(parsed, "meaningfulFindings", "关键发现", "关键线索", "核心发现");
}

function resolveNextActions(parsed: Record<string, unknown> | null): unknown {
  return resolveKey(parsed, "nextActions", "下一步动作", "下一步", "后续动作");
}

function resolvePrioritizedFindings(parsed: Record<string, unknown> | null): unknown[] | undefined {
  const raw = resolveKey(parsed, "prioritizedFindings", "优先级发现", "优先发现");
  if (!Array.isArray(raw)) return undefined;
  return raw;
}

function normalizePrioritizedItem(item: Record<string, unknown>): { priority: string; content: string; reason: string } {
  return {
    priority: pickString(item.priority || item.优先级),
    content: pickString(item.content || item.发现 || item.内容),
    reason: pickString(item.reason || item.原因 || item.理由)
  };
}

export function parseProjectProfileCandidate(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const rawProject = resolveProjectDetection(parsed);
  const projectName = pickString(rawProject.projectName || rawProject.项目名称);
  const productName = pickString(rawProject.productName || rawProject.产品名称);
  const projectCategory = pickString(rawProject.projectCategory || rawProject.项目类别);
  const evidence = pickStringList(rawProject.evidence || rawProject.依据, 4);
  const meaningfulFindings = pickStringList(resolveMeaningfulFindings(parsed), 8);
  const prioritizedFindings = parsePrioritizedFindingsFromText(content);
  const nextActions = pickStringList(resolveNextActions(parsed), 6);
  return { projectName, productName, projectCategory, evidence, meaningfulFindings, prioritizedFindings, nextActions };
}

export function listProjectProfileMissingReasons(candidate: ReturnType<typeof parseProjectProfileCandidate>) {
  const reasons: string[] = [];
  if (!candidate.projectName && !candidate.productName) reasons.push("missing projectDetection.projectName/productName");
  if (candidate.meaningfulFindings.length === 0) reasons.push("meaningfulFindings is empty");
  if (candidate.prioritizedFindings.length === 0) reasons.push("prioritizedFindings is empty");
  if (candidate.nextActions.length === 0) reasons.push("nextActions is empty");
  return reasons;
}

export function parsePrioritizedFindingsFromText(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const raw = resolvePrioritizedFindings(parsed);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => item as Record<string, unknown>)
    .map((item) => normalizePrioritizedItem(item))
    .filter((item): item is { priority: "P0" | "P1" | "P2"; content: string; reason: string } =>
      (item.priority === "P0" || item.priority === "P1" || item.priority === "P2") && !!item.content)
    .slice(0, 8);
}

export function parseProjectDetectionFromText(content: string) {
  const parsed = parseJsonObjectFromText(content);
  const rawProject = resolveProjectDetection(parsed);
  return {
    projectName: pickString(rawProject.projectName || rawProject.项目名称),
    productName: pickString(rawProject.productName || rawProject.产品名称),
    projectCategory: pickString(rawProject.projectCategory || rawProject.项目类别),
    evidence: pickStringList(rawProject.evidence || rawProject.依据, 4)
  };
}
