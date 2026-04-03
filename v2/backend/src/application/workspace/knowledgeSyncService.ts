/**
 * KnowledgeSyncService — 知识库 → 业务助手上下文同步
 *
 * 将 ProjectKnowledgeBase 序列化为结构化文本，
 * 通过 system prompt 注入业务助手 Agent 的上下文。
 */

import type { ProjectKnowledgeBase } from "../../domain/workspace/projectTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncOptions = {
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 6000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildKnowledgeSyncContext(
  kb: ProjectKnowledgeBase | null | undefined,
  options?: SyncOptions
): string {
  if (!kb) return "";

  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const sections: string[] = [];

  // Terms
  const terms = kb.ontologyTerms.slice(0, 10);
  if (terms.length > 0) {
    sections.push(
      `[项目知识-业务概念]\n${terms.map((t) => `- ${t.term}${t.aliases.length > 0 ? `（${t.aliases.join("/")}）` : ""}: ${t.definition}`).join("\n")}`
    );
  }

  // Rules
  const rules = kb.stableRules.slice(0, 8);
  if (rules.length > 0) {
    sections.push(
      `[项目知识-业务规则]\n${rules.map((r) => `- ${r.rule}`).join("\n")}`
    );
  }

  // Components
  const comps = kb.componentInventory.slice(0, 8);
  if (comps.length > 0) {
    sections.push(
      `[项目知识-功能模块]\n${comps.map((c) => `- ${c.component}: ${c.responsibility}`).join("\n")}`
    );
  }

  // Code Map
  const code = kb.codeMap.slice(0, 6);
  if (code.length > 0) {
    sections.push(
      `[项目知识-代码映射]\n${code.map((c) => `- ${c.capability} → ${c.codePaths.join(", ") || "未映射"}`).join("\n")}`
    );
  }

  // Risks
  const risks = kb.knownRisks.slice(0, 6);
  if (risks.length > 0) {
    sections.push(
      `[项目知识-已知风险]\n${risks.map((r) => `- ${r.risk} → ${r.mitigation}`).join("\n")}`
    );
  }

  // Change Patterns
  const patterns = kb.changePatterns.slice(0, 4);
  if (patterns.length > 0) {
    sections.push(
      `[项目知识-变更模式]\n${patterns.map((p) => `- ${p.pattern}: ${p.preferredFlow}`).join("\n")}`
    );
  }

  let result = sections.join("\n\n");
  if (result.length > maxChars) {
    result = `${result.slice(0, maxChars - 3)}...`;
  }
  return result;
}
