import type { AttachmentAnalysisReport, AttachmentUploadInput } from '../../../domain/workspace/types';

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

function mergeBusinessConfirmation(reports: AttachmentAnalysisReport[]) {
  const latest = reports[reports.length - 1];
  const latestConfirmation = latest.businessConfirmation || {
    coreIntent: "",
    successCriteria: [],
    interactionInsights: { primaryFlow: [], keyInteractions: [], exceptionPaths: [], usabilityRisks: [] },
    necessityAssessment: { mustDo: [], shouldDo: [], canDefer: [], outOfScope: [], rationale: "" },
    evidenceRefs: [],
    boundarySummary: "",
    functionalPoints: [],
    confirmationChecklist: [],
    versionDiffSummary: "",
    diffNarratives: [],
    diffConfirmationOrder: []
  };
  const coreIntent = reports.map((item) => item.businessConfirmation?.coreIntent || "").filter(Boolean).slice(-1)[0] || "";
  const successCriteria = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.successCriteria || []))).slice(0, 12);
  const primaryFlow = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.interactionInsights?.primaryFlow || []))).slice(0, 12);
  const keyInteractions = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.interactionInsights?.keyInteractions || []))).slice(0, 14);
  const exceptionPaths = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.interactionInsights?.exceptionPaths || []))).slice(0, 12);
  const usabilityRisks = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.interactionInsights?.usabilityRisks || []))).slice(0, 12);
  const mustDo = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.necessityAssessment?.mustDo || []))).slice(0, 12);
  const shouldDo = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.necessityAssessment?.shouldDo || []))).slice(0, 12);
  const canDefer = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.necessityAssessment?.canDefer || []))).slice(0, 12);
  const outOfScope = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.necessityAssessment?.outOfScope || []))).slice(0, 12);
  const necessityRationale = reports.map((item) => item.businessConfirmation?.necessityAssessment?.rationale || "").filter(Boolean).slice(-1)[0] || "";
  const evidenceRefs = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.evidenceRefs || []))).slice(0, 20);
  const boundarySummary = reports.map((item) => item.businessConfirmation?.boundarySummary || "").filter(Boolean).slice(-1)[0] || "";
  const versionDiffSummary = reports.map((item) => item.businessConfirmation?.versionDiffSummary || "").filter(Boolean).slice(-1)[0] || "";
  const functionalPoints = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.functionalPoints || []))).slice(0, 16);
  const confirmationChecklist = reports
    .flatMap((item) => item.businessConfirmation?.confirmationChecklist || [])
    .sort((a, b) => a.order - b.order)
    .slice(0, 16)
    .map((item, index) => ({ ...item, order: index + 1 }));
  const diffNarratives = Array.from(new Set(reports.flatMap((item) => item.businessConfirmation?.diffNarratives || []))).slice(0, 18);
  const diffConfirmationOrder = reports
    .flatMap((item) => item.businessConfirmation?.diffConfirmationOrder || [])
    .sort((a, b) => a.order - b.order)
    .slice(0, 16)
    .map((item, index) => ({ ...item, order: index + 1 }));
  return {
    coreIntent: coreIntent || latestConfirmation.coreIntent,
    successCriteria: successCriteria.length > 0 ? successCriteria : latestConfirmation.successCriteria,
    interactionInsights: {
      primaryFlow: primaryFlow.length > 0 ? primaryFlow : latestConfirmation.interactionInsights.primaryFlow,
      keyInteractions: keyInteractions.length > 0 ? keyInteractions : latestConfirmation.interactionInsights.keyInteractions,
      exceptionPaths: exceptionPaths.length > 0 ? exceptionPaths : latestConfirmation.interactionInsights.exceptionPaths,
      usabilityRisks: usabilityRisks.length > 0 ? usabilityRisks : latestConfirmation.interactionInsights.usabilityRisks
    },
    necessityAssessment: {
      mustDo: mustDo.length > 0 ? mustDo : latestConfirmation.necessityAssessment.mustDo,
      shouldDo: shouldDo.length > 0 ? shouldDo : latestConfirmation.necessityAssessment.shouldDo,
      canDefer: canDefer.length > 0 ? canDefer : latestConfirmation.necessityAssessment.canDefer,
      outOfScope: outOfScope.length > 0 ? outOfScope : latestConfirmation.necessityAssessment.outOfScope,
      rationale: necessityRationale || latestConfirmation.necessityAssessment.rationale
    },
    evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : latestConfirmation.evidenceRefs,
    boundarySummary: boundarySummary || latestConfirmation.boundarySummary,
    functionalPoints: functionalPoints.length > 0 ? functionalPoints : latestConfirmation.functionalPoints,
    confirmationChecklist: confirmationChecklist.length > 0 ? confirmationChecklist : latestConfirmation.confirmationChecklist,
    versionDiffSummary: versionDiffSummary || latestConfirmation.versionDiffSummary,
    diffNarratives: diffNarratives.length > 0 ? diffNarratives : latestConfirmation.diffNarratives,
    diffConfirmationOrder: diffConfirmationOrder.length > 0 ? diffConfirmationOrder : latestConfirmation.diffConfirmationOrder
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

export function mergeAttachmentReports(input: AttachmentUploadInput, reports: AttachmentAnalysisReport[], totalBatches: number): AttachmentAnalysisReport {
  if (reports.length === 1) {
    return reports[0];
  }
  const primary = reports[reports.length - 1];
  const bestProjectDetection = reports.reduce((best, current) => {
    const bestScore = rankProjectConfidence(best.projectDetection.confidence) * 10 + best.projectDetection.evidence.length;
    const currentScore = rankProjectConfidence(current.projectDetection.confidence) * 10 + current.projectDetection.evidence.length;
    return currentScore > bestScore ? current : best;
  }, primary);
  const fileStats =
    input.sourceType === "folder" && Array.isArray(input.files)
      ? {
          totalFiles: input.files.length,
          textFiles: input.files.filter((item) => item.excerpt.trim().length > 0).length,
          binaryFiles: input.files.filter((item) => item.excerpt.trim().length === 0).length
        }
      : primary.fileStats;
  const fileSelection =
    input.sourceType === "folder" && Array.isArray(input.files)
      ? {
          consideredFiles: input.files.length,
          includedFiles: input.files.length,
          skippedNoiseFiles: reports.reduce((total, item) => total + item.fileSelection.skippedNoiseFiles, 0),
          skippedEmptyFiles: reports.reduce((total, item) => total + item.fileSelection.skippedEmptyFiles, 0),
          sampled: reports.some((item) => item.fileSelection.sampled),
          sampleReason: reports.map((item) => item.fileSelection.sampleReason).find(Boolean) || "",
          includedPaths: Array.from(new Set(reports.flatMap((item) => item.fileSelection.includedPaths))).slice(0, 12),
          ignoredFiles: Array.from(
            new Map(reports.flatMap((item) => item.fileSelection.ignoredFiles).map((item) => [`${item.path}:${item.reason}`, item])).values()
          ).slice(0, 20)
        }
      : primary.fileSelection;
  return {
    ...primary,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    analyzedTarget: input.sourceType === "folder" ? input.folderName?.trim() || input.fileName : input.fileName,
    analyzedAt: new Date().toISOString(),
    fileStats,
    fileSelection,
    projectDetection: {
      ...bestProjectDetection.projectDetection,
      evidence: Array.from(new Set(reports.flatMap((item) => item.projectDetection.evidence))).slice(0, 6)
    },
    meaningfulFindings: Array.from(new Set(reports.flatMap((item) => item.meaningfulFindings))).slice(0, 16),
    prioritizedFindings: Array.from(
      new Map(reports.flatMap((item) => item.prioritizedFindings).map((item) => [`${item.priority}:${item.content}`, item])).values()
    ).slice(0, 16),
    nextActions: Array.from(new Set(reports.flatMap((item) => item.nextActions))).slice(0, 14),
    clarificationQuestions: Array.from(new Set(reports.flatMap((item) => item.clarificationQuestions))).slice(0, 12),
    suggestions: Array.from(new Set(reports.flatMap((item) => item.suggestions))).slice(0, 14),
    llmContext: {
      ...primary.llmContext,
      strategy: "folder-batch-job",
      digest: `strategy=folder-batch-job;batches=${totalBatches};mergedReports=${reports.length}`,
      excerptLength: reports.reduce((total, item) => total + item.llmContext.excerptLength, 0),
      chunkCount: reports.reduce((total, item) => total + item.llmContext.chunkCount, 0),
      promptContextLength: reports.reduce((total, item) => total + item.llmContext.promptContextLength, 0),
      agentCount: reports.reduce((total, item) => total + item.llmContext.agentCount, 0),
      unknownSignalCount: reports.reduce((total, item) => total + item.llmContext.unknownSignalCount, 0),
      degraded: reports.some((item) => item.llmContext.degraded),
      degradeReason:
        reports
          .map((item) => item.llmContext.degradeReason)
          .filter((item) => item.trim().length > 0)
          .join(" | ")
          .slice(0, 300) || ""
    },
    understanding: `${primary.understanding}（分批汇总：${reports.length}/${totalBatches}）`,
    agentOutputs: reports.flatMap((item) => item.agentOutputs).slice(0, 60),
    businessConfirmation: mergeBusinessConfirmation(reports),
    deepInsights: mergeDeepInsights(reports),
    reportQuality: mergeReportQuality(reports)
  };
}
