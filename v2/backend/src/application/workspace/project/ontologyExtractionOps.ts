/**
 * ontologyExtractionOps — 知识库字段提取辅助
 *
 * 从 ontologyService 拆出的 8 个非导出提取函数，被 extractKnowledgeBaseUpdateOp
 * 调用，从分析结果（domainKnowledgeEntries/traceabilityMap/boundary/analysisReport）
 * 提取并填充 ProjectKnowledgeBase 的 7 个字段。纯函数，无 IO 依赖。
 */
import type { ProjectKnowledgeBase } from '../../../domain/workspace/projectTypes';
import type { AnalysisReportInput, BoundaryInput, DomainKnowledgeEntry, TraceabilityMap } from './ontologyTypes';

export function mergeOntologyTerms(
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
    const prev = termMap.get(entry.term);
    if (prev) {
      // Update existing — preserve aliases from previous version
      termMap.set(entry.term, {
        term: entry.term,
        aliases: [...new Set([...(prev.aliases ?? []), ...entry.mappedEntities])],
        definition: entry.definition,
        evidence: entry.evidence,
      });
      updatedTerms.push(entry.term);
    } else {
      termMap.set(entry.term, {
        term: entry.term,
        aliases: entry.mappedEntities.length > 0 ? [...entry.mappedEntities] : [],
        definition: entry.definition,
        evidence: entry.evidence,
      });
      newTerms.push(entry.term);
    }
  }

  return { terms: Array.from(termMap.values()), newTerms, updatedTerms };
}

export function extractComponentInventory(
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

export function extractCodeMap(
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

export function extractKnownRisks(boundary: BoundaryInput): ProjectKnowledgeBase["knownRisks"] {
  if (!boundary?.riskAreas) return [];
  return boundary.riskAreas.map((r) => ({
    risk: r.risk,
    mitigation: r.mitigation,
    trigger: r.trigger,
  }));
}

export function extractStableRules(
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

export function extractDecisionLog(
  existing: ProjectKnowledgeBase["decisionLog"],
  report: AnalysisReportInput
): ProjectKnowledgeBase["decisionLog"] {
  const decisions = new Map<string, ProjectKnowledgeBase["decisionLog"][number]>();
  for (const d of existing) {
    decisions.set(d.decision, d);
  }

  const assessment = report?.businessConfirmation?.necessityAssessment;
  if (!assessment) return existing;

  const entries: Array<{ items: string[]; priority: string }> = [
    { items: assessment.mustDo ?? [], priority: "mustDo" },
    { items: assessment.shouldDo ?? [], priority: "shouldDo" },
    { items: assessment.canDefer ?? [], priority: "canDefer" },
  ];

  for (const { items, priority } of entries) {
    for (const item of items) {
      if (!item || decisions.has(item)) continue;
      decisions.set(item, {
        decision: item,
        status: "active",
        rationale: `${priority} — ${assessment.rationale ?? ""}`.trim(),
        iterationVersion: "",
      });
    }
  }

  return Array.from(decisions.values());
}

export function extractChangePatterns(
  existing: ProjectKnowledgeBase["changePatterns"],
  report: AnalysisReportInput
): ProjectKnowledgeBase["changePatterns"] {
  const patterns = new Map<string, ProjectKnowledgeBase["changePatterns"][number]>();
  for (const p of existing) {
    patterns.set(p.pattern, p);
  }

  // 从 domainKnowledge.rules 提取变更模式
  const rules = report?.domainKnowledge?.rules ?? [];
  for (const rule of rules) {
    if (!rule || patterns.has(rule)) continue;
    patterns.set(rule, {
      pattern: rule,
      preferredFlow: rule,
      avoid: "",
    });
  }

  // 从 versionDiffDetailed 中提取 high-risk 变更为变更模式
  const diff = report?.versionDiffDetailed;
  if (diff) {
    const allChanges = [
      ...(diff.added ?? []),
      ...(diff.changed ?? []),
      ...(diff.removed ?? []),
    ];
    for (const change of allChanges) {
      if (change.risk !== "high" && change.risk !== "medium") continue;
      const key = `${change.dimension}:${change.item}`;
      if (patterns.has(key)) continue;
      patterns.set(key, {
        pattern: `${change.item}（${change.dimension}）`,
        preferredFlow: change.impact,
        avoid: change.risk === "high" ? "直接变更，需先评审" : "",
      });
    }
  }

  return Array.from(patterns.values());
}

export function extractReportRisks(
  existing: ProjectKnowledgeBase["knownRisks"],
  report: AnalysisReportInput
): ProjectKnowledgeBase["knownRisks"] {
  const risks = new Map<string, ProjectKnowledgeBase["knownRisks"][number]>();
  for (const r of existing) {
    risks.set(r.risk, r);
  }

  // 从 analysisReport.risks 提取
  for (const risk of report?.risks ?? []) {
    if (!risk || risks.has(risk)) continue;
    risks.set(risk, { risk, mitigation: "", trigger: "" });
  }

  // 从 releaseReview.rollback 提取
  const rollback = report?.releaseReview?.rollback;
  if (rollback?.trigger) {
    const key = `回滚触发: ${rollback.trigger}`;
    if (!risks.has(key)) {
      risks.set(key, {
        risk: key,
        mitigation: (rollback.actions ?? []).join("; "),
        trigger: rollback.trigger,
      });
    }
  }

  return Array.from(risks.values());
}
