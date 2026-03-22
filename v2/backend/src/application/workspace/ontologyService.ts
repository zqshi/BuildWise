/**
 * OntologyService — 统一本体服务
 *
 * 从分析结果（domainKnowledgeEntries, traceabilityMap, boundary）
 * 提取并填充 ProjectKnowledgeBase 的全部 7 个字段。
 *
 * 设计：纯函数 Ops 模式，无副作用，无 IO。
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

type TraceabilityPage = { name: string; path: string; components: string[] };
type TraceabilityApi = { path: string; method: string; description: string };
type TraceabilityEntity = { name: string; fields: string[] };

type TraceabilityMap = {
  pages: TraceabilityPage[];
  apis: TraceabilityApi[];
  entities: TraceabilityEntity[];
} | null;

type BoundaryInput = {
  codePaths: string[];
  requirementRefs: string[];
  riskAreas?: Array<{ risk: string; mitigation: string; trigger: string }>;
} | null;

type OntologyInput = {
  domainKnowledgeEntries: DomainKnowledgeEntry[];
  traceabilityMap: TraceabilityMap;
  boundary: BoundaryInput;
  analysisReport: unknown;
};

type OntologyUpdateResult = {
  updatedKb: ProjectKnowledgeBase;
  newTerms: string[];
  updatedTerms: string[];
  newRules: string[];
  newComponents: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeOntologyTerms(
  existing: ProjectKnowledgeBase["ontologyTerms"],
  entries: DomainKnowledgeEntry[]
): { terms: ProjectKnowledgeBase["ontologyTerms"]; newTerms: string[]; updatedTerms: string[] } {
  const termMap = new Map<string, ProjectKnowledgeBase["ontologyTerms"][number]>();
  for (const t of existing) {
    termMap.set(t.term, { ...t });
  }

  const newTerms: string[] = [];
  const updatedTerms: string[] = [];

  for (const entry of entries) {
    if (termMap.has(entry.term)) {
      // Update existing
      termMap.set(entry.term, {
        term: entry.term,
        aliases: [],
        definition: entry.definition,
        evidence: entry.evidence,
      });
      updatedTerms.push(entry.term);
    } else {
      termMap.set(entry.term, {
        term: entry.term,
        aliases: [],
        definition: entry.definition,
        evidence: entry.evidence,
      });
      newTerms.push(entry.term);
    }
  }

  return { terms: Array.from(termMap.values()), newTerms, updatedTerms };
}

function extractComponentInventory(
  traceabilityMap: TraceabilityMap,
  entries: DomainKnowledgeEntry[]
): ProjectKnowledgeBase["componentInventory"] {
  if (!traceabilityMap) return [];

  const components: ProjectKnowledgeBase["componentInventory"] = [];
  for (const page of traceabilityMap.pages) {
    for (const comp of page.components) {
      const relatedReqs = entries
        .filter((e) => e.mappedPages.includes(page.path))
        .map((e) => e.term);
      components.push({
        component: comp,
        responsibility: `${page.name} 页面组件`,
        relatedRequirements: relatedReqs,
        relatedCodePaths: [],
      });
    }
  }
  return components;
}

function extractCodeMap(
  traceabilityMap: TraceabilityMap,
  boundary: BoundaryInput
): ProjectKnowledgeBase["codeMap"] {
  const codeMap: ProjectKnowledgeBase["codeMap"] = [];

  if (traceabilityMap) {
    for (const api of traceabilityMap.apis) {
      codeMap.push({
        capability: `${api.method} ${api.path} — ${api.description}`,
        codePaths: [],
        tests: [],
      });
    }

    for (const page of traceabilityMap.pages) {
      codeMap.push({
        capability: `页面 ${page.name} (${page.path})`,
        codePaths: boundary?.codePaths?.filter((p) => p.includes(page.name.toLowerCase())) || [],
        tests: [],
      });
    }
  }

  return codeMap;
}

function extractKnownRisks(boundary: BoundaryInput): ProjectKnowledgeBase["knownRisks"] {
  if (!boundary?.riskAreas) return [];
  return boundary.riskAreas.map((r) => ({
    risk: r.risk,
    mitigation: r.mitigation,
    trigger: r.trigger,
  }));
}

function extractStableRules(
  existing: ProjectKnowledgeBase["stableRules"],
  entries: DomainKnowledgeEntry[]
): { rules: ProjectKnowledgeBase["stableRules"]; newRules: string[] } {
  const ruleMap = new Map<string, ProjectKnowledgeBase["stableRules"][number]>();
  for (const r of existing) {
    ruleMap.set(r.rule, r);
  }

  const newRules: string[] = [];
  for (const entry of entries) {
    if (entry.definition && !ruleMap.has(entry.definition)) {
      // 领域知识条目同时可以作为稳定规则
      if (entry.mappedEntities.length > 0 || entry.mappedApis.length > 0) {
        ruleMap.set(entry.definition, {
          rule: entry.definition,
          rationale: entry.evidence,
          source: "ontology-extraction",
        });
        newRules.push(entry.definition);
      }
    }
  }

  return { rules: Array.from(ruleMap.values()), newRules };
}

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

  const updatedKb: ProjectKnowledgeBase = {
    ontologyTerms: terms,
    stableRules: rules,
    componentInventory,
    codeMap,
    decisionLog: existingKb.decisionLog,
    knownRisks,
    changePatterns: existingKb.changePatterns,
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
