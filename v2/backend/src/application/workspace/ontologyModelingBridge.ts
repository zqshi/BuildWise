/**
 * OntologyModelingBridge — 将 KB + 分析数据转换为 ContinuousModeling 输入
 *
 * 桥接 ProjectKnowledgeBase 与 ContinuousModeling 类型系统之间的差异。
 */

import type { ProjectKnowledgeBase } from "../../domain/workspace/projectTypes";
import type {
  BusinessEntity,
  BusinessRelation,
  BusinessRule,
  IterationModelingInput,
  OntologyTerm,
} from "../../domain/continuousModeling/types";

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

type TraceabilityMap = {
  pages: Array<{ name: string; path: string; components: string[] }>;
  apis: Array<{ path: string; method: string; description: string }>;
  entities: Array<{ name: string; fields: string[] }>;
} | null;

type BridgeInput = {
  projectId: number;
  iterationId: number;
  knowledgeBase: ProjectKnowledgeBase;
  domainKnowledgeEntries: DomainKnowledgeEntry[];
  traceabilityMap: TraceabilityMap;
};

// ---------------------------------------------------------------------------
// Conversion Helpers
// ---------------------------------------------------------------------------

function kbTermsToOntologyTerms(
  kbTerms: ProjectKnowledgeBase["ontologyTerms"],
  entries: DomainKnowledgeEntry[]
): OntologyTerm[] {
  const seen = new Set<string>();
  const result: OntologyTerm[] = [];

  for (const t of kbTerms) {
    if (seen.has(t.term)) continue;
    seen.add(t.term);
    result.push({
      canonicalTerm: t.term,
      aliases: t.aliases || [],
      technicalAliases: [],
      definition: t.definition,
      evidence: t.evidence ? [t.evidence] : [],
    });
  }

  for (const e of entries) {
    if (seen.has(e.term)) continue;
    seen.add(e.term);
    result.push({
      canonicalTerm: e.term,
      aliases: [],
      technicalAliases: e.mappedEntities,
      definition: e.definition,
      evidence: e.evidence ? [e.evidence] : [],
    });
  }

  return result;
}

function traceToEntities(
  traceabilityMap: TraceabilityMap
): BusinessEntity[] {
  if (!traceabilityMap) return [];
  return traceabilityMap.entities.map((e, idx) => ({
    id: `entity-${idx + 1}`,
    name: e.name,
    businessName: e.name,
    fields: e.fields.map((f) => ({ name: f, type: "string", required: false })),
  }));
}

function kbRulesToBusinessRules(
  kbRules: ProjectKnowledgeBase["stableRules"],
  entries: DomainKnowledgeEntry[],
  entities: BusinessEntity[]
): BusinessRule[] {
  const entityNameToId = new Map<string, string>();
  for (const e of entities) {
    entityNameToId.set(e.name, e.id);
  }

  return kbRules.map((r, idx) => {
    // 尝试从 domainKnowledgeEntries 中找到关联的实体
    const linkedEntityIds: string[] = [];
    const linkedApiIds: string[] = [];
    const linkedSurfaceIds: string[] = [];

    for (const entry of entries) {
      const ruleWords = r.rule.split("").filter((_, i) => i + 2 <= r.rule.length).map((_, i) => r.rule.slice(i, i + 2));
      const termWords = entry.term.split("").filter((_, i) => i + 2 <= entry.term.length).map((_, i) => entry.term.slice(i, i + 2));
      const hasOverlap = termWords.some((tw) => ruleWords.includes(tw));

      if (hasOverlap) {
        for (const me of entry.mappedEntities) {
          const eid = entityNameToId.get(me);
          if (eid && !linkedEntityIds.includes(eid)) linkedEntityIds.push(eid);
        }
        for (const api of entry.mappedApis) {
          if (!linkedApiIds.includes(api)) linkedApiIds.push(api);
        }
        for (const page of entry.mappedPages) {
          if (!linkedSurfaceIds.includes(page)) linkedSurfaceIds.push(page);
        }
      }
    }

    return {
      id: `rule-${idx + 1}`,
      name: r.rule.slice(0, 30),
      statement: r.rule,
      linkedEntityIds,
      linkedSurfaceIds,
      linkedApiIds,
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildModelingInputFromAnalysis(
  input: BridgeInput
): IterationModelingInput {
  const ontologyTerms = kbTermsToOntologyTerms(
    input.knowledgeBase.ontologyTerms,
    input.domainKnowledgeEntries
  );

  const entities = traceToEntities(input.traceabilityMap);

  const rules = kbRulesToBusinessRules(
    input.knowledgeBase.stableRules,
    input.domainKnowledgeEntries,
    entities
  );

  const relations: BusinessRelation[] = [];

  return {
    projectId: input.projectId,
    iterationId: input.iterationId,
    baselineSnapshot: null,
    businessInputs: input.domainKnowledgeEntries.map((e) => `${e.term}: ${e.definition}`),
    ontologyTerms,
    entities,
    relations,
    rules,
  };
}
