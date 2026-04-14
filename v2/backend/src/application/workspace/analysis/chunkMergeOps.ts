/**
 * chunkMergeOps — 分片结果确定性合并
 *
 * 当 Core Analysis / Business Confirmation Agent 对大文档做分片调用后，
 * 各片产出独立结构化结果，本模块提供零 LLM 调用的确定性合并函数。
 *
 * 合并策略：
 * - 字符串取最长非空 / 取最后一个
 * - 数组 concat → 去重 → 截取上限
 * - 数值取加权平均 / 取最大
 * - 嵌套对象递归合并
 */

import type { AttachmentAnalysisReport } from '../../../domain/workspace/analysisTypes';

// ---------------------------------------------------------------------------
// 通用去重工具
// ---------------------------------------------------------------------------

function dedupStrings(items: string[], limit: number): string[] {
  return Array.from(new Set(items.filter(Boolean))).slice(0, limit);
}

function dedupByKey<T extends Record<string, unknown>>(items: T[], keyFn: (item: T) => string, limit: number): T[] {
  return Array.from(new Map(items.map((item) => [keyFn(item), item])).values()).slice(0, limit);
}

function pickLongest(values: string[]): string {
  return values.filter(Boolean).sort((a, b) => b.length - a.length)[0] || "";
}

function pickLast(values: string[]): string {
  return values.filter(Boolean).slice(-1)[0] || "";
}

// ---------------------------------------------------------------------------
// Core Analysis 分片输出类型
// ---------------------------------------------------------------------------

export type CoreAnalysisChunkResult = {
  projectDetection: AttachmentAnalysisReport["projectDetection"];
  meaningfulFindings: string[];
  prioritizedFindings: AttachmentAnalysisReport["prioritizedFindings"];
  nextActions: string[];
  attachmentInsights: AttachmentAnalysisReport["attachmentInsights"];
  deepInsights: AttachmentAnalysisReport["deepInsights"];
  traceabilityMap: AttachmentAnalysisReport["traceabilityMap"];
  executableConstraints: AttachmentAnalysisReport["executableConstraints"];
  domainKnowledge: AttachmentAnalysisReport["domainKnowledge"];
  versionDiffDetailed: AttachmentAnalysisReport["versionDiffDetailed"];
  clarificationQuestions: string[];
  risks: string[];
  suggestions: string[];
};

function rankConfidence(value: "high" | "medium" | "low"): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2 };

export function mergeCoreAnalysisChunks(chunks: CoreAnalysisChunkResult[]): CoreAnalysisChunkResult {
  if (chunks.length === 1) return chunks[0];

  // projectDetection: 取 evidence 最多 + confidence 最高的
  const bestProject = chunks.reduce((best, cur) => {
    const bestScore = rankConfidence(best.projectDetection.confidence) * 10 + best.projectDetection.evidence.length;
    const curScore = rankConfidence(cur.projectDetection.confidence) * 10 + cur.projectDetection.evidence.length;
    return curScore > bestScore ? cur : best;
  }, chunks[0]);
  const projectDetection = {
    ...bestProject.projectDetection,
    evidence: dedupStrings(chunks.flatMap((c) => c.projectDetection.evidence), 8)
  };

  // 数组字段：concat → 去重 → 限量
  const meaningfulFindings = dedupStrings(chunks.flatMap((c) => c.meaningfulFindings), 15);

  const prioritizedFindings = dedupByKey(
    chunks.flatMap((c) => c.prioritizedFindings),
    (item) => `${item.priority}:${item.content}`,
    15
  ).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));

  const nextActions = dedupStrings(chunks.flatMap((c) => c.nextActions), 12);
  const clarificationQuestions = dedupStrings(chunks.flatMap((c) => c.clarificationQuestions), 12);
  const risks = dedupStrings(chunks.flatMap((c) => c.risks), 12);
  const suggestions = dedupStrings(chunks.flatMap((c) => c.suggestions), 14);

  // attachmentInsights: 取 confidence 最高的，keyCharacteristics 合并
  const bestInsight = chunks.reduce((best, cur) =>
    rankConfidence(cur.attachmentInsights.confidence) > rankConfidence(best.attachmentInsights.confidence) ? cur : best
  , chunks[0]);
  const attachmentInsights = {
    ...bestInsight.attachmentInsights,
    keyCharacteristics: dedupStrings(chunks.flatMap((c) => c.attachmentInsights.keyCharacteristics), 12),
    limitations: dedupStrings(chunks.flatMap((c) => c.attachmentInsights.limitations), 8)
  };

  // deepInsights: fileInsights 直接 concat（每片负责不同文件），crossFileInsights 各字段合并
  const allFileInsights = chunks.flatMap((c) => c.deepInsights.fileInsights);
  const fileInsights = dedupByKey(allFileInsights, (item) => item.path || item.fileName, 400);
  const analyzed = fileInsights.filter((i) => i.status === "analyzed").length;
  const partial = fileInsights.filter((i) => i.status === "partial").length;
  const failed = fileInsights.filter((i) => i.status === "failed").length;
  const considered = fileInsights.length;
  const deepInsights: CoreAnalysisChunkResult["deepInsights"] = {
    coverage: {
      consideredFiles: considered,
      analyzedFiles: analyzed,
      partialFiles: partial,
      failedFiles: failed,
      coveragePercent: considered === 0 ? 0 : Math.round(((analyzed + partial) / considered) * 100)
    },
    fileInsights,
    crossFileInsights: {
      themes: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.themes), 12),
      conflicts: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.conflicts), 12),
      gaps: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.gaps), 12),
      recommendations: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.recommendations), 12),
      conflictChains: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.conflictChains), 12),
      rootCauses: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.rootCauses), 12),
      impactScope: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.impactScope), 12),
      decisionSuggestions: dedupStrings(chunks.flatMap((c) => c.deepInsights.crossFileInsights.decisionSuggestions), 12)
    }
  };

  // traceabilityMap: 各子数组 concat 去重；coverageScore 取加权平均
  const traceabilityMap: CoreAnalysisChunkResult["traceabilityMap"] = {
    requirementToComponent: dedupByKey(
      chunks.flatMap((c) => c.traceabilityMap.requirementToComponent),
      (item) => item.requirement,
      20
    ),
    componentToCode: dedupByKey(
      chunks.flatMap((c) => c.traceabilityMap.componentToCode),
      (item) => item.component,
      20
    ),
    requirementToCode: dedupByKey(
      chunks.flatMap((c) => c.traceabilityMap.requirementToCode),
      (item) => item.requirement,
      20
    ),
    coverageScore: chunks.length === 0 ? 0 : Math.round(chunks.reduce((sum, c) => sum + c.traceabilityMap.coverageScore, 0) / chunks.length),
    mappingConfidence: chunks.reduce((best, c) =>
      rankConfidence(c.traceabilityMap.mappingConfidence) > rankConfidence(best) ? c.traceabilityMap.mappingConfidence : best
    , "low" as "high" | "medium" | "low"),
    unmappedRequirements: dedupStrings(chunks.flatMap((c) => c.traceabilityMap.unmappedRequirements), 12),
    conflicts: dedupStrings(chunks.flatMap((c) => c.traceabilityMap.conflicts), 12),
    gaps: dedupStrings(chunks.flatMap((c) => c.traceabilityMap.gaps), 12)
  };

  // executableConstraints: whitelist 类字段 concat 去重
  const executableConstraints: CoreAnalysisChunkResult["executableConstraints"] = {
    componentWhitelist: dedupStrings(chunks.flatMap((c) => c.executableConstraints.componentWhitelist), 20),
    codePathWhitelist: dedupStrings(chunks.flatMap((c) => c.executableConstraints.codePathWhitelist), 20),
    acceptanceChecks: dedupStrings(chunks.flatMap((c) => c.executableConstraints.acceptanceChecks), 16),
    gateRules: dedupStrings(chunks.flatMap((c) => c.executableConstraints.gateRules), 12)
  };

  // domainKnowledge: terms 合并（term 相同则合并 mappedTo），rules 合并
  const termMap = new Map<string, CoreAnalysisChunkResult["domainKnowledge"]["terms"][number]>();
  for (const chunk of chunks) {
    for (const t of chunk.domainKnowledge.terms) {
      const existing = termMap.get(t.term);
      if (existing) {
        existing.mappedTo = {
          pages: dedupStrings([...existing.mappedTo.pages, ...t.mappedTo.pages], 10),
          apis: dedupStrings([...existing.mappedTo.apis, ...t.mappedTo.apis], 10),
          entities: dedupStrings([...existing.mappedTo.entities, ...t.mappedTo.entities], 10),
          codePaths: dedupStrings([...existing.mappedTo.codePaths, ...t.mappedTo.codePaths], 10)
        };
        if (rankConfidence(t.bindingStrength) > rankConfidence(existing.bindingStrength)) {
          existing.bindingStrength = t.bindingStrength;
        }
      } else {
        termMap.set(t.term, { ...t });
      }
    }
  }
  const domainKnowledge: CoreAnalysisChunkResult["domainKnowledge"] = {
    terms: Array.from(termMap.values()).slice(0, 30),
    rules: dedupStrings(chunks.flatMap((c) => c.domainKnowledge.rules), 20),
    unknowns: dedupStrings(chunks.flatMap((c) => c.domainKnowledge.unknowns), 12)
  };

  // versionDiffDetailed: summary 取最长，数组字段 concat 去重
  const versionDiffDetailed: CoreAnalysisChunkResult["versionDiffDetailed"] = {
    summary: pickLongest(chunks.map((c) => c.versionDiffDetailed.summary)),
    impactScope: dedupStrings(chunks.flatMap((c) => c.versionDiffDetailed.impactScope), 12),
    riskPoints: dedupStrings(chunks.flatMap((c) => c.versionDiffDetailed.riskPoints), 12),
    added: dedupByKey(chunks.flatMap((c) => c.versionDiffDetailed.added), (i) => `${i.dimension}:${i.item}`, 15),
    changed: dedupByKey(chunks.flatMap((c) => c.versionDiffDetailed.changed), (i) => `${i.dimension}:${i.item}`, 15),
    removed: dedupByKey(chunks.flatMap((c) => c.versionDiffDetailed.removed), (i) => `${i.dimension}:${i.item}`, 15)
  };

  return {
    projectDetection,
    meaningfulFindings,
    prioritizedFindings,
    nextActions,
    attachmentInsights,
    deepInsights,
    traceabilityMap,
    executableConstraints,
    domainKnowledge,
    versionDiffDetailed,
    clarificationQuestions,
    risks,
    suggestions
  };
}

// ---------------------------------------------------------------------------
// Business Confirmation 分片输出类型
// ---------------------------------------------------------------------------

export type BizConfirmationChunkResult = {
  coreIntent: string;
  successCriteria: string[];
  interactionInsights: AttachmentAnalysisReport["businessConfirmation"]["interactionInsights"];
  necessityAssessment: AttachmentAnalysisReport["businessConfirmation"]["necessityAssessment"];
  evidenceRefs: string[];
  boundarySummary: string;
  functionalPoints: string[];
  confirmationChecklist: AttachmentAnalysisReport["businessConfirmation"]["confirmationChecklist"];
  versionDiffSummary: string;
  diffNarratives: string[];
  diffConfirmationOrder: AttachmentAnalysisReport["businessConfirmation"]["diffConfirmationOrder"];
};

export function mergeBizConfirmationChunks(chunks: BizConfirmationChunkResult[]): BizConfirmationChunkResult {
  if (chunks.length === 1) return chunks[0];

  const coreIntent = pickLast(chunks.map((c) => c.coreIntent));
  const successCriteria = dedupStrings(chunks.flatMap((c) => c.successCriteria), 12);
  const interactionInsights: BizConfirmationChunkResult["interactionInsights"] = {
    primaryFlow: dedupStrings(chunks.flatMap((c) => c.interactionInsights.primaryFlow), 12),
    keyInteractions: dedupStrings(chunks.flatMap((c) => c.interactionInsights.keyInteractions), 14),
    exceptionPaths: dedupStrings(chunks.flatMap((c) => c.interactionInsights.exceptionPaths), 12),
    usabilityRisks: dedupStrings(chunks.flatMap((c) => c.interactionInsights.usabilityRisks), 12)
  };
  const necessityAssessment: BizConfirmationChunkResult["necessityAssessment"] = {
    mustDo: dedupStrings(chunks.flatMap((c) => c.necessityAssessment.mustDo), 12),
    shouldDo: dedupStrings(chunks.flatMap((c) => c.necessityAssessment.shouldDo), 12),
    canDefer: dedupStrings(chunks.flatMap((c) => c.necessityAssessment.canDefer), 12),
    outOfScope: dedupStrings(chunks.flatMap((c) => c.necessityAssessment.outOfScope), 12),
    rationale: pickLongest(chunks.map((c) => c.necessityAssessment.rationale))
  };
  const evidenceRefs = dedupStrings(chunks.flatMap((c) => c.evidenceRefs), 20);
  const boundarySummary = pickLongest(chunks.map((c) => c.boundarySummary));
  const functionalPoints = dedupStrings(chunks.flatMap((c) => c.functionalPoints), 16);
  const confirmationChecklist = chunks
    .flatMap((c) => c.confirmationChecklist)
    .sort((a, b) => a.order - b.order)
    .slice(0, 16)
    .map((item, index) => ({ ...item, order: index + 1 }));
  const versionDiffSummary = pickLongest(chunks.map((c) => c.versionDiffSummary));
  const diffNarratives = dedupStrings(chunks.flatMap((c) => c.diffNarratives), 18);
  const diffConfirmationOrder = chunks
    .flatMap((c) => c.diffConfirmationOrder)
    .sort((a, b) => a.order - b.order)
    .slice(0, 16)
    .map((item, index) => ({ ...item, order: index + 1 }));

  return {
    coreIntent,
    successCriteria,
    interactionInsights,
    necessityAssessment,
    evidenceRefs,
    boundarySummary,
    functionalPoints,
    confirmationChecklist,
    versionDiffSummary,
    diffNarratives,
    diffConfirmationOrder
  };
}
