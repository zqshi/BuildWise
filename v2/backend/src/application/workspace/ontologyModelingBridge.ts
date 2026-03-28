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

type ReportTraceabilityMap = {
  requirementToComponent: Array<{ requirement: string; components: string[]; evidence: string }>;
  componentToCode: Array<{ component: string; codePaths: string[]; evidence: string }>;
} | null;

type BridgeInput = {
  projectId: number;
  iterationId: number;
  knowledgeBase: ProjectKnowledgeBase;
  domainKnowledgeEntries: DomainKnowledgeEntry[];
  traceabilityMap: TraceabilityMap;
  reportTraceabilityMap?: ReportTraceabilityMap;
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

/**
 * 从 domainKnowledgeEntries 聚合构建 Bridge 需要的 TraceabilityMap。
 * report.domainKnowledge.terms[].mappedTo 包含 pages/apis/entities，
 * 转换成 Bridge 的 { pages, apis, entities } 格式。
 */
export function buildTraceabilityMapFromDomainEntries(
  entries: DomainKnowledgeEntry[]
): TraceabilityMap {
  const pageSet = new Map<string, string[]>();
  const apiSet = new Set<string>();
  const entityMap = new Map<string, Set<string>>();

  for (const e of entries) {
    for (const page of e.mappedPages) {
      if (!pageSet.has(page)) pageSet.set(page, []);
    }
    for (const api of e.mappedApis) {
      apiSet.add(api);
    }
    for (const ent of e.mappedEntities) {
      if (!entityMap.has(ent)) entityMap.set(ent, new Set());
    }
  }

  if (pageSet.size === 0 && apiSet.size === 0 && entityMap.size === 0) return null;

  return {
    pages: Array.from(pageSet.entries()).map(([name, components]) => ({
      name, path: name, components,
    })),
    apis: Array.from(apiSet).map((path) => ({
      path, method: "GET", description: path,
    })),
    entities: Array.from(entityMap.entries()).map(([name, fields]) => ({
      name, fields: Array.from(fields),
    })),
  };
}

/**
 * 从 reportTraceabilityMap 推导实体间关系。
 * requirementToComponent 中，同一 requirement 映射到多个 component → 产生关联。
 */
function traceToRelations(
  reportTrace: ReportTraceabilityMap,
  entities: BusinessEntity[],
  entries: DomainKnowledgeEntry[]
): BusinessRelation[] {
  const relations: BusinessRelation[] = [];
  const entityNames = new Set(entities.map((e) => e.name));
  const seen = new Set<string>();

  // 从 domainKnowledgeEntries 的 mappedEntities 推导：
  // 如果一个 term 映射到多个 entity，这些 entity 之间存在关联
  for (const entry of entries) {
    const mapped = entry.mappedEntities.filter((e) => entityNames.has(e));
    for (let i = 0; i < mapped.length; i++) {
      for (let j = i + 1; j < mapped.length; j++) {
        const key = [mapped[i], mapped[j]].sort().join("↔");
        if (seen.has(key)) continue;
        seen.add(key);
        relations.push({
          id: `rel-${relations.length + 1}`,
          fromEntityId: entities.find((e) => e.name === mapped[i])!.id,
          toEntityId: entities.find((e) => e.name === mapped[j])!.id,
          type: "one_to_many",
          businessMeaning: `via ${entry.term}`,
        });
      }
    }
  }

  // 从 reportTraceabilityMap.requirementToComponent 推导：
  // 同一 requirement 映射到多个 component → 关联
  if (reportTrace?.requirementToComponent) {
    for (const mapping of reportTrace.requirementToComponent) {
      const matchedEntities = mapping.components
        .filter((c) => entityNames.has(c))
        .map((c) => entities.find((e) => e.name === c)!);
      for (let i = 0; i < matchedEntities.length; i++) {
        for (let j = i + 1; j < matchedEntities.length; j++) {
          const key = [matchedEntities[i].name, matchedEntities[j].name].sort().join("↔");
          if (seen.has(key)) continue;
          seen.add(key);
          relations.push({
            id: `rel-${relations.length + 1}`,
            fromEntityId: matchedEntities[i].id,
            toEntityId: matchedEntities[j].id,
            type: "one_to_many",
            businessMeaning: mapping.requirement,
          });
        }
      }
    }
  }

  return relations;
}

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

  const relations = traceToRelations(
    input.reportTraceabilityMap ?? null,
    entities,
    input.domainKnowledgeEntries
  );

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
