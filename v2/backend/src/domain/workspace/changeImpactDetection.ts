/**
 * changeImpactDetection — 需求影响范围前置检测（domain 纯函数）
 *
 * 在用户提交需求文本时，以已构建的本体（knowledgeBase）为基础，做反向匹配，
 * 输出可能受影响的本体项与代码/交付物，供前端前置提示（非阻断）。
 *
 * 纯函数、零外部依赖、无 LLM。本体不全或无命中时 hasImpact=false（诚实，不造假）。
 * 匹配策略：需求文本 token 化后，对本体四向（terms/components/rules）做包含匹配。
 */

import type { ProjectKnowledgeBase } from './projectTypes';

export type ChangeImpactResult = {
  hasImpact: boolean;
  affectedTerms: string[];
  affectedEntities: string[];
  affectedRules: string[];
  affectedArtifacts: string[];
  summary: string;
};

const EMPTY_KB: ProjectKnowledgeBase = {
  ontologyTerms: [],
  componentInventory: [],
  stableRules: [],
  codeMap: [],
  decisionLog: [],
  knownRisks: [],
  changePatterns: [],
  updatedAt: "",
};

// 最小停用词/标点集合（中英），匹配时忽略以降噪
const STOP_CHARS = /[\s，。、,.!?;:（）()【】\[\]""''`'""\n\r\t]+/;

/**
 * 把需求文本切分为用于匹配的候选 token。
 * 英文按词、中文按 2-3 字 n-gram，去标点与单字符噪声。
 */
function tokenize(message: string): string[] {
  const text = (message || "").toLowerCase();
  const segments = text.split(STOP_CHARS).filter((s) => s.length > 0);
  const tokens = new Set<string>();
  for (const seg of segments) {
    // 英文/数字词整体作为一个 token
    if (/^[a-z0-9_\-]+$/.test(seg)) {
      if (seg.length >= 2) tokens.add(seg);
      continue;
    }
    // 中文段：取 2-gram 与 3-gram
    const chars = [...seg];
    for (let i = 0; i < chars.length; i += 1) {
      // T7b: 只取 3-gram（去 2-gram 减少短词误报；2 字术语由 fieldsHit 精确匹配覆盖）
      if (i + 3 <= chars.length) tokens.add(chars.slice(i, i + 3).join(""));
    }
  }
  return Array.from(tokens);
}

/** 字段是否命中: 精确匹配(message 段含术语全词, 覆盖 2 字短术语召回) || n-gram 正向(术语含 message 长片段)。
 *  T7b: 去 2-gram + 去反向包含(tok.includes(fv))减少误报, 精确匹配补短术语召回。 */
function fieldsHit(fields: string[], segments: string[], tokens: string[]): boolean {
  for (const f of fields) {
    const fv = (f || "").toLowerCase();
    if (!fv || fv.length < 2) continue;
    if (segments.some((seg) => seg.includes(fv))) return true;
    if (tokens.some((tok) => fv.includes(tok))) return true;
  }
  return false;
}

export function detectChangeImpactOp(input: {
  userMessage: string;
  knowledgeBase?: ProjectKnowledgeBase | null;
}): ChangeImpactResult {
  const kb = input.knowledgeBase ?? EMPTY_KB;
  const messageText = (input.userMessage || "").toLowerCase();
  const segments = messageText.split(STOP_CHARS).filter((s) => s.length > 0);
  const tokens = tokenize(input.userMessage);
  const affectedTerms: string[] = [];
  const affectedEntities: string[] = [];
  const affectedRules: string[] = [];
  const affectedArtifacts: string[] = [];

  if (segments.length > 0 || tokens.length > 0) {
    for (const term of kb.ontologyTerms ?? []) {
      const fields = [term.term, ...(term.aliases ?? [])];
      if (fieldsHit(fields, segments, tokens)) {
        if (!affectedTerms.includes(term.term)) affectedTerms.push(term.term);
      }
    }

    for (const comp of kb.componentInventory ?? []) {
      const fields = [comp.component, comp.responsibility, ...(comp.relatedRequirements ?? [])];
      if (fieldsHit(fields, segments, tokens)) {
        if (!affectedEntities.includes(comp.component)) affectedEntities.push(comp.component);
        for (const path of comp.relatedCodePaths ?? []) {
          if (path && !affectedArtifacts.includes(path)) affectedArtifacts.push(path);
        }
      }
    }

    for (const rule of kb.stableRules ?? []) {
      const fields = [rule.rule, rule.rationale];
      if (fieldsHit(fields, segments, tokens)) {
        if (!affectedRules.includes(rule.rule)) affectedRules.push(rule.rule);
      }
    }
  }

  const total = affectedTerms.length + affectedEntities.length + affectedRules.length;
  const hasImpact = total > 0;
  const summary = hasImpact
    ? `检测到 ${total} 个本体项可能受影响（术语 ${affectedTerms.length}、组件 ${affectedEntities.length}、规则 ${affectedRules.length}）。`
    : "本体中未匹配到与该需求相关的项。";

  return {
    hasImpact,
    affectedTerms,
    affectedEntities,
    affectedRules,
    affectedArtifacts,
    summary,
  };
}

/**
 * T7b: 路径 → 受影响代码 artifactId 精确映射。
 * 规则：路径含 "backend" → backend-code（后端模块）；否则 → frontend-code（前端组件/hook/样式）。
 * 返回去重后的 artifactId 列表；空路径返回空数组（由调用方决定保守策略）。
 * 消除旧实现"硬编码双标 frontend+backend"导致的改前端误阻断后端问题。
 */
export function resolveAffectedCodeArtifactIds(paths: string[]): Array<"frontend-code" | "backend-code"> {
  const ids = new Set<"frontend-code" | "backend-code">();
  for (const raw of paths) {
    const p = (raw || "").toLowerCase().trim();
    if (!p) continue;
    if (p.includes("backend")) {
      ids.add("backend-code");
    } else {
      ids.add("frontend-code");
    }
  }
  return Array.from(ids);
}
