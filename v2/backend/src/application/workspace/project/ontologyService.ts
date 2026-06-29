/**
 * OntologyService — 统一本体服务
 *
 * 从分析结果提取并填充 ProjectKnowledgeBase（extractKnowledgeBaseUpdateOp），
 * 并对新本体项与已有 KB 做碰撞检测（detectOntologyCollisionsOp）。
 *
 * 类型定义见 ontologyTypes，字段提取辅助见 ontologyExtractionOps。
 * 纯函数 Ops 模式，无副作用，无 IO。
 */
import type { ProjectKnowledgeBase } from '../../../domain/workspace/projectTypes';
import type { CollisionResult, DomainKnowledgeEntry, OntologyInput, OntologyUpdateResult, TermCollision } from './ontologyTypes';
import {
  mergeOntologyTerms,
  extractComponentInventory,
  extractCodeMap,
  extractKnownRisks,
  extractStableRules,
  extractDecisionLog,
  extractChangePatterns,
  extractReportRisks
} from './ontologyExtractionOps';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractKnowledgeBaseUpdateOp(
  existingKb: ProjectKnowledgeBase,
  input: OntologyInput
): OntologyUpdateResult {
  const { terms, newTerms, updatedTerms } = mergeOntologyTerms(
    existingKb.ontologyTerms,
    input.domainKnowledgeEntries
  );

  const { rules, newRules } = extractStableRules(
    existingKb.stableRules,
    input.domainKnowledgeEntries
  );

  const componentInventory = input.traceabilityMap
    ? extractComponentInventory(input.traceabilityMap, input.domainKnowledgeEntries)
    : existingKb.componentInventory;

  const codeMap = input.traceabilityMap
    ? extractCodeMap(input.traceabilityMap, input.boundary)
    : existingKb.codeMap;

  const knownRisks = input.boundary?.riskAreas
    ? extractKnownRisks(input.boundary)
    : existingKb.knownRisks;

  // 合并 boundary risks 和 analysisReport risks
  const mergedRisks = input.analysisReport
    ? extractReportRisks(knownRisks, input.analysisReport)
    : knownRisks;

  const decisionLog = input.analysisReport
    ? extractDecisionLog(existingKb.decisionLog, input.analysisReport)
    : existingKb.decisionLog;

  const changePatterns = input.analysisReport
    ? extractChangePatterns(existingKb.changePatterns, input.analysisReport)
    : existingKb.changePatterns;

  const updatedKb: ProjectKnowledgeBase = {
    ontologyTerms: terms,
    stableRules: rules,
    componentInventory,
    codeMap,
    decisionLog,
    knownRisks: mergedRisks,
    changePatterns,
    updatedAt: new Date().toISOString(),
  };

  return {
    updatedKb,
    newTerms,
    updatedTerms,
    newRules,
    newComponents: componentInventory
      .filter((c) => !existingKb.componentInventory.some((ec) => ec.component === c.component))
      .map((c) => c.component),
  };
}

// ── Ontology Collision Detection (merged from ontologyCollisionDetector.ts) ──

function isSimilarDefinition(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = a.replace(/\s+/g, "").toLowerCase();
  const nb = b.replace(/\s+/g, "").toLowerCase();
  return na === nb;
}

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

    for (const rule of existingKb.stableRules) {
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
