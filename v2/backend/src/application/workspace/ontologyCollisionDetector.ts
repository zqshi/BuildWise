/**
 * OntologyCollisionDetector — 知识冲突检测
 *
 * 检测新的领域知识条目与现有知识库之间的碰撞：
 * - knowledgeHits: 同名术语已存在（定义一致）
 * - knowledgeConflicts: 同名术语定义不一致
 * - termCollisions: 新条目与现有稳定规则矛盾
 */

import type { ProjectKnowledgeBase } from "../../domain/workspace/projectTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DomainKnowledgeEntry = {
  term: string;
  definition: string;
  mappedPages: string[];
  mappedApis: string[];
  mappedEntities: string[];
  mappedCodePaths: string[];
  evidence: string;
};

type TermCollision = {
  newTerm: string;
  newDefinition: string;
  existingRule: string;
};

type CollisionResult = {
  knowledgeHits: string[];
  knowledgeConflicts: string[];
  termCollisions: TermCollision[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSimilarDefinition(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = a.replace(/\s+/g, "").toLowerCase();
  const nb = b.replace(/\s+/g, "").toLowerCase();
  return na === nb;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectOntologyCollisionsOp(
  existingKb: ProjectKnowledgeBase,
  newEntries: DomainKnowledgeEntry[]
): CollisionResult {
  const knowledgeHits: string[] = [];
  const knowledgeConflicts: string[] = [];
  const termCollisions: TermCollision[] = [];

  const existingTermMap = new Map<string, string>();
  for (const t of existingKb.ontologyTerms) {
    existingTermMap.set(t.term, t.definition);
  }

  for (const entry of newEntries) {
    const existingDef = existingTermMap.get(entry.term);
    if (existingDef != null) {
      if (isSimilarDefinition(existingDef, entry.definition)) {
        knowledgeHits.push(`术语命中: ${entry.term}`);
      } else {
        knowledgeConflicts.push(
          `术语冲突: ${entry.term} — 现有定义: "${existingDef}" vs 新定义: "${entry.definition}"`
        );
      }
    }

    // 检查与现有稳定规则的矛盾
    for (const rule of existingKb.stableRules) {
      // 用条目 term 中的每个字符（中文2字以上子串）或整词匹配规则
      const termChars = entry.term.replace(/\s+/g, "");
      const overlaps = termChars.length >= 2 &&
        (rule.rule.includes(termChars) || termChars.split("").some((_, i) => {
          if (i + 2 > termChars.length) return false;
          const sub = termChars.slice(i, i + 2);
          return rule.rule.includes(sub);
        }));
      if (overlaps && !isSimilarDefinition(rule.rule, entry.definition)) {
        termCollisions.push({
          newTerm: entry.term,
          newDefinition: entry.definition,
          existingRule: rule.rule,
        });
      }
    }
  }

  return { knowledgeHits, knowledgeConflicts, termCollisions };
}
