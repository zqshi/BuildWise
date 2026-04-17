import type { AttachmentAnalysisReport, AttachmentUploadInput } from '../../../domain/workspace/types';
import { isLowSignalText } from './extractors';

function rankProjectConfidence(value: "high" | "medium" | "low") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function mergeDeepInsights(reports: AttachmentAnalysisReport[]) {
  const allFileInsights = reports.flatMap((item) => item.deepInsights?.fileInsights || []);
  const dedupFileInsights = Array.from(new Map(allFileInsights.map((item) => [item.path || item.fileName, item])).values()).slice(0, 400);
  const analyzedFiles = dedupFileInsights.filter((item) => item.status === "analyzed").length;
  const partialFiles = dedupFileInsights.filter((item) => item.status === "partial").length;
  const failedFiles = dedupFileInsights.filter((item) => item.status === "failed").length;
  const consideredFiles = dedupFileInsights.length;
  const coveragePercent = consideredFiles === 0 ? 0 : Math.round(((analyzedFiles + partialFiles) / consideredFiles) * 100);
  const themes = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.themes || []))).slice(0, 12);
  const conflicts = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.conflicts || []))).slice(0, 12);
  const gaps = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.gaps || []))).slice(0, 12);
  const recommendations = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.recommendations || []))).slice(0, 12);
  const conflictChains = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.conflictChains || []))).slice(0, 12);
  const rootCauses = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.rootCauses || []))).slice(0, 12);
  const impactScope = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.impactScope || []))).slice(0, 12);
  const decisionSuggestions = Array.from(new Set(reports.flatMap((item) => item.deepInsights?.crossFileInsights?.decisionSuggestions || []))).slice(0, 12);
  return {
    coverage: {
      consideredFiles,
      analyzedFiles,
      partialFiles,
      failedFiles,
      coveragePercent
    },
    fileInsights: dedupFileInsights,
    crossFileInsights: {
      themes,
      conflicts,
      gaps,
      recommendations,
      conflictChains,
      rootCauses,
      impactScope,
      decisionSuggestions
    }
  };
}

function dedupStrings(reports: AttachmentAnalysisReport[], extractor: (r: AttachmentAnalysisReport) => string[], limit: number): string[] {
  return Array.from(new Set(reports.flatMap(extractor))).slice(0, limit);
}

function lastNonEmpty(reports: AttachmentAnalysisReport[], extractor: (r: AttachmentAnalysisReport) => string): string {
  return reports.map(extractor).filter(Boolean).slice(-1)[0] || "";
}

function mergeOrderedItems<T extends { order: number }>(reports: AttachmentAnalysisReport[], extractor: (r: AttachmentAnalysisReport) => T[], limit: number): T[] {
  return reports.flatMap(extractor).sort((a, b) => a.order - b.order).slice(0, limit).map((item, index) => ({ ...item, order: index + 1 }));
}

function or<T>(merged: T[], fallback: T[]): T[] { return merged.length > 0 ? merged : fallback; }

function mergeInteractionInsights(reports: AttachmentAnalysisReport[], fallback: { primaryFlow: string[]; keyInteractions: string[]; exceptionPaths: string[]; usabilityRisks: string[] }) {
  return {
    primaryFlow: or(dedupStrings(reports, (r) => r.businessConfirmation?.interactionInsights?.primaryFlow || [], 12), fallback.primaryFlow),
    keyInteractions: or(dedupStrings(reports, (r) => r.businessConfirmation?.interactionInsights?.keyInteractions || [], 14), fallback.keyInteractions),
    exceptionPaths: or(dedupStrings(reports, (r) => r.businessConfirmation?.interactionInsights?.exceptionPaths || [], 12), fallback.exceptionPaths),
    usabilityRisks: or(dedupStrings(reports, (r) => r.businessConfirmation?.interactionInsights?.usabilityRisks || [], 12), fallback.usabilityRisks),
  };
}

function mergeNecessityAssessment(reports: AttachmentAnalysisReport[], fallback: { mustDo: string[]; shouldDo: string[]; canDefer: string[]; outOfScope: string[]; rationale: string }) {
  return {
    mustDo: or(dedupStrings(reports, (r) => r.businessConfirmation?.necessityAssessment?.mustDo || [], 12), fallback.mustDo),
    shouldDo: or(dedupStrings(reports, (r) => r.businessConfirmation?.necessityAssessment?.shouldDo || [], 12), fallback.shouldDo),
    canDefer: or(dedupStrings(reports, (r) => r.businessConfirmation?.necessityAssessment?.canDefer || [], 12), fallback.canDefer),
    outOfScope: or(dedupStrings(reports, (r) => r.businessConfirmation?.necessityAssessment?.outOfScope || [], 12), fallback.outOfScope),
    rationale: lastNonEmpty(reports, (r) => r.businessConfirmation?.necessityAssessment?.rationale || "") || fallback.rationale,
  };
}

function mergeBusinessConfirmation(reports: AttachmentAnalysisReport[]) {
  const fb = reports[reports.length - 1].businessConfirmation || {
    coreIntent: "", successCriteria: [],
    interactionInsights: { primaryFlow: [], keyInteractions: [], exceptionPaths: [], usabilityRisks: [] },
    necessityAssessment: { mustDo: [], shouldDo: [], canDefer: [], outOfScope: [], rationale: "" },
    evidenceRefs: [], boundarySummary: "", functionalPoints: [], confirmationChecklist: [],
    versionDiffSummary: "", diffNarratives: [], diffConfirmationOrder: [],
  };
  return {
    coreIntent: lastNonEmpty(reports, (r) => r.businessConfirmation?.coreIntent || "") || fb.coreIntent,
    successCriteria: or(dedupStrings(reports, (r) => r.businessConfirmation?.successCriteria || [], 12), fb.successCriteria),
    interactionInsights: mergeInteractionInsights(reports, fb.interactionInsights),
    necessityAssessment: mergeNecessityAssessment(reports, fb.necessityAssessment),
    evidenceRefs: or(dedupStrings(reports, (r) => r.businessConfirmation?.evidenceRefs || [], 20), fb.evidenceRefs),
    boundarySummary: lastNonEmpty(reports, (r) => r.businessConfirmation?.boundarySummary || "") || fb.boundarySummary,
    functionalPoints: or(dedupStrings(reports, (r) => r.businessConfirmation?.functionalPoints || [], 16), fb.functionalPoints),
    confirmationChecklist: or(mergeOrderedItems(reports, (r) => r.businessConfirmation?.confirmationChecklist || [], 16), fb.confirmationChecklist),
    versionDiffSummary: lastNonEmpty(reports, (r) => r.businessConfirmation?.versionDiffSummary || "") || fb.versionDiffSummary,
    diffNarratives: or(dedupStrings(reports, (r) => r.businessConfirmation?.diffNarratives || [], 18), fb.diffNarratives),
    diffConfirmationOrder: or(mergeOrderedItems(reports, (r) => r.businessConfirmation?.diffConfirmationOrder || [], 16), fb.diffConfirmationOrder),
  };
}

function mergeReportQuality(reports: AttachmentAnalysisReport[]) {
  const latest = reports[reports.length - 1];
  const scores = reports.map((item) => (Number.isFinite(item.reportQuality?.score) ? item.reportQuality.score : 0));
  const score =
    scores.length > 0 ? Math.max(0, Math.min(100, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length))) : 0;
  const publishable = reports.every((item) => item.reportQuality?.publishable === true);
  const summary = reports.map((item) => item.reportQuality?.summary || "").filter(Boolean).slice(-1)[0] || latest.reportQuality.summary;
  const missingItems = Array.from(new Set(reports.flatMap((item) => item.reportQuality?.missingItems || []))).slice(0, 20);
  const actionRequired = Array.from(new Set(reports.flatMap((item) => item.reportQuality?.actionRequired || []))).slice(0, 20);
  return {
    publishable,
    score,
    summary,
    missingItems: missingItems.length > 0 ? missingItems : latest.reportQuality.missingItems,
    actionRequired: actionRequired.length > 0 ? actionRequired : latest.reportQuality.actionRequired
  };
}

function mergeFolderFileStats(input: AttachmentUploadInput & { files: NonNullable<AttachmentUploadInput["files"]> }) {
  return {
    totalFiles: input.files.length,
    textFiles: input.files.filter((item) => item.excerpt.trim().length > 0).length,
    binaryFiles: input.files.filter((item) => item.excerpt.trim().length === 0).length,
  };
}

function mergeFolderFileSelection(input: AttachmentUploadInput & { files: NonNullable<AttachmentUploadInput["files"]> }, reports: AttachmentAnalysisReport[]) {
  return {
    consideredFiles: input.files.length, includedFiles: input.files.length,
    skippedNoiseFiles: reports.reduce((t, r) => t + r.fileSelection.skippedNoiseFiles, 0),
    skippedEmptyFiles: reports.reduce((t, r) => t + r.fileSelection.skippedEmptyFiles, 0),
    sampled: reports.some((r) => r.fileSelection.sampled),
    sampleReason: reports.map((r) => r.fileSelection.sampleReason).find(Boolean) || "",
    includedPaths: Array.from(new Set(reports.flatMap((r) => r.fileSelection.includedPaths))).slice(0, 12),
    ignoredFiles: Array.from(
      new Map(reports.flatMap((r) => r.fileSelection.ignoredFiles).map((f) => [`${f.path}:${f.reason}`, f])).values()
    ).slice(0, 20),
  };
}

function mergeLlmContext(primary: AttachmentAnalysisReport, reports: AttachmentAnalysisReport[], totalBatches: number) {
  return {
    ...primary.llmContext, strategy: "folder-batch-job" as const,
    digest: `策略：文件夹分批合并，共 ${totalBatches} 批，合并报告 ${reports.length} 份`,
    excerptLength: reports.reduce((t, r) => t + r.llmContext.excerptLength, 0),
    chunkCount: reports.reduce((t, r) => t + r.llmContext.chunkCount, 0),
    promptContextLength: reports.reduce((t, r) => t + r.llmContext.promptContextLength, 0),
    agentCount: reports.reduce((t, r) => t + r.llmContext.agentCount, 0),
    unknownSignalCount: reports.reduce((t, r) => t + r.llmContext.unknownSignalCount, 0),
    degraded: reports.some((r) => r.llmContext.degraded),
    degradeReason: reports.map((r) => r.llmContext.degradeReason).filter((s) => s.trim().length > 0).join(" | ").slice(0, 300) || "",
  };
}

export function mergeAttachmentReports(input: AttachmentUploadInput, reports: AttachmentAnalysisReport[], totalBatches: number): AttachmentAnalysisReport {
  if (reports.length === 1) return reports[0];
  const primary = reports[reports.length - 1];
  const bestDetection = reports.reduce((best, cur) => {
    const bs = rankProjectConfidence(best.projectDetection.confidence) * 10 + best.projectDetection.evidence.length;
    const cs = rankProjectConfidence(cur.projectDetection.confidence) * 10 + cur.projectDetection.evidence.length;
    return cs > bs ? cur : best;
  }, primary);
  const isFolder = input.sourceType === "folder" && Array.isArray(input.files);
  const folderInput = isFolder ? input as AttachmentUploadInput & { files: NonNullable<AttachmentUploadInput["files"]> } : null;
  return {
    ...primary,
    fileName: input.fileName,
    sourceType: isFolder ? "folder" : "single-file",
    analyzedTarget: isFolder ? input.folderName?.trim() || input.fileName : input.fileName,
    analyzedAt: new Date().toISOString(),
    fileStats: folderInput ? mergeFolderFileStats(folderInput) : primary.fileStats,
    fileSelection: folderInput ? mergeFolderFileSelection(folderInput, reports) : primary.fileSelection,
    projectDetection: { ...bestDetection.projectDetection, evidence: dedupStrings(reports, (r) => r.projectDetection.evidence, 6) },
    meaningfulFindings: dedupStrings(reports, (r) => r.meaningfulFindings, 16),
    prioritizedFindings: Array.from(
      new Map(reports.flatMap((r) => r.prioritizedFindings).map((f) => [`${f.priority}:${f.content}`, f])).values()
    ).slice(0, 16),
    nextActions: dedupStrings(reports, (r) => r.nextActions, 14),
    clarificationQuestions: dedupStrings(reports, (r) => r.clarificationQuestions, 12),
    suggestions: dedupStrings(reports, (r) => r.suggestions, 14),
    llmContext: mergeLlmContext(primary, reports, totalBatches),
    understanding: isLowSignalText(primary.understanding) ? "" : `${primary.understanding}（分批汇总：${reports.length}/${totalBatches}）`,
    agentOutputs: reports.flatMap((r) => r.agentOutputs).slice(0, 60),
    businessConfirmation: mergeBusinessConfirmation(reports),
    deepInsights: mergeDeepInsights(reports),
    reportQuality: mergeReportQuality(reports),
  };
}
