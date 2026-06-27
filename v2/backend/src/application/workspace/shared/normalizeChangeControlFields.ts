import type { IterationChangeControl } from '../../../domain/workspace/types';

export function normalizeExecutionStatus(value: unknown): "pending" | "passed" | "failed" | "blocked" | "skipped" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "passed" || status === "failed" || status === "blocked" || status === "skipped") {
    return status;
  }
  return "pending";
}

export function normalizeArtifactStage(
  value: unknown
): "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive" {
  const stage = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    stage === "clarification" ||
    stage === "scope" ||
    stage === "interaction" ||
    stage === "development" ||
    stage === "testing" ||
    stage === "release" ||
    stage === "archive"
  ) {
    return stage;
  }
  return "clarification";
}

export function normalizeArtifactStatus(value: unknown): "pending" | "partial" | "ready" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "partial" || status === "ready") {
    return status;
  }
  return "pending";
}

export function normalizeArtifactGateStatus(value: unknown): "pending" | "passed" | "blocked" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "passed" || status === "blocked") {
    return status;
  }
  return "pending";
}

export function normalizeArtifactEditCapability(value: unknown): "none" | "rich-text" | "prototype-select" {
  const capability = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (capability === "rich-text" || capability === "prototype-select") {
    return capability;
  }
  return "none";
}

export function fallbackArtifactWorkflow() {
  return {
    activeStage: "clarification" as const,
    updatedAt: "",
    items: [
      { id: "analysis-report", stage: "clarification" as const },
      { id: "boundary-confirmation", stage: "scope" as const },
      { id: "prototype-preview", stage: "interaction" as const },
      { id: "frontend-code", stage: "development" as const },
      { id: "backend-code", stage: "development" as const },
      { id: "test-matrix", stage: "testing" as const },
      { id: "acceptance-checklist", stage: "testing" as const },
      { id: "release-review", stage: "release" as const },
      { id: "delivery-package", stage: "archive" as const }
    ]
  };
}

export function normalizeAnalysisMetadata(control: IterationChangeControl | undefined) {
  return {
    pendingHumanConfirmation: Boolean(control?.pendingHumanConfirmation),
    lastAnalysisAt: control?.lastAnalysisAt || "",
    lastAnalysisFileName: control?.lastAnalysisFileName || "",
    lastAnalysisDigest: control?.lastAnalysisDigest || "",
    lastUploadedInputFingerprint: control?.lastUploadedInputFingerprint || "",
    lastUploadedAt: control?.lastUploadedAt || "",
    lastFailedAnalysisInput: control?.lastFailedAnalysisInput || "",
    lastFailedAnalysisAt: control?.lastFailedAnalysisAt || "",
    lastFailedAnalysisError: control?.lastFailedAnalysisError || "",
    lastAttachmentUploadId: control?.lastAttachmentUploadId || "",
    lastAttachmentIngestJobId: control?.lastAttachmentIngestJobId || "",
    lastAttachmentAnalysisJobId: control?.lastAttachmentAnalysisJobId || "",
    lastAttachmentReportId: control?.lastAttachmentReportId || ""
  };
}

export function normalizeClarificationFields(control: IterationChangeControl | undefined) {
  return {
    clarificationRounds: Number.isInteger(control?.clarificationRounds) ? Number(control?.clarificationRounds) : 0,
    clarificationQuestions: Array.isArray(control?.clarificationQuestions) ? control?.clarificationQuestions ?? [] : [],
    clarificationDraftResolvedQuestions: Array.isArray(control?.clarificationDraftResolvedQuestions)
      ? control?.clarificationDraftResolvedQuestions ?? []
      : [],
    clarificationDraftUpdatedAt: control?.clarificationDraftUpdatedAt || "",
    lastClarificationResolution: {
      resolvedQuestions: Array.isArray(control?.lastClarificationResolution?.resolvedQuestions)
        ? control?.lastClarificationResolution?.resolvedQuestions ?? []
        : [],
      unresolvedQuestions: Array.isArray(control?.lastClarificationResolution?.unresolvedQuestions)
        ? control?.lastClarificationResolution?.unresolvedQuestions ?? []
        : [],
      updatedAt: control?.lastClarificationResolution?.updatedAt || ""
    },
    lastClarificationNote: control?.lastClarificationNote || "",
    confirmedAt: control?.confirmedAt || "",
    confirmedBy: control?.confirmedBy || ""
  };
}

export function normalizeTestQualityUx(control: IterationChangeControl | undefined) {
  return {
    generatedTestMatrix: Array.isArray(control?.generatedTestMatrix)
      ? (control?.generatedTestMatrix ?? [])
          .map((item) => ({
            type: typeof item?.type === "string" ? item.type : "",
            caseId: typeof item?.caseId === "string" ? item.caseId : "",
            focus: typeof item?.focus === "string" ? item.focus : "",
            expected: typeof item?.expected === "string" ? item.expected : "",
            evidence: typeof item?.evidence === "string" ? item.evidence : "",
            executionStatus: normalizeExecutionStatus(item?.executionStatus),
            executionUpdatedAt: typeof item?.executionUpdatedAt === "string" ? item.executionUpdatedAt : "",
            executionBy: typeof item?.executionBy === "string" ? item.executionBy : "",
            executionNote: typeof item?.executionNote === "string" ? item.executionNote : ""
          }))
          .filter((item) => item.type || item.caseId || item.focus || item.expected || item.evidence)
      : [],
    generatedTestMatrixUpdatedAt: control?.generatedTestMatrixUpdatedAt || "",
    testMatrixExecutionUpdatedAt: control?.testMatrixExecutionUpdatedAt || "",
    qualityArtifacts: {
      unitTests: Array.isArray(control?.qualityArtifacts?.unitTests) ? control?.qualityArtifacts?.unitTests ?? [] : [],
      contractTests: Array.isArray(control?.qualityArtifacts?.contractTests) ? control?.qualityArtifacts?.contractTests ?? [] : [],
      acceptanceChecklist: Array.isArray(control?.qualityArtifacts?.acceptanceChecklist)
        ? control?.qualityArtifacts?.acceptanceChecklist ?? []
        : [],
      regressionPoints: Array.isArray(control?.qualityArtifacts?.regressionPoints) ? control?.qualityArtifacts?.regressionPoints ?? [] : [],
      materializedFiles: Array.isArray(control?.qualityArtifacts?.materializedFiles) ? control?.qualityArtifacts?.materializedFiles ?? [] : [],
      updatedAt: typeof control?.qualityArtifacts?.updatedAt === "string" ? control.qualityArtifacts.updatedAt : ""
    },
    uxArtifacts: {
      informationArchitecture: Array.isArray(control?.uxArtifacts?.informationArchitecture)
        ? control?.uxArtifacts?.informationArchitecture ?? []
        : [],
      interactionFlows: Array.isArray(control?.uxArtifacts?.interactionFlows) ? control?.uxArtifacts?.interactionFlows ?? [] : [],
      uiStates: Array.isArray(control?.uxArtifacts?.uiStates) ? control?.uxArtifacts?.uiStates ?? [] : [],
      uxConstraints: Array.isArray(control?.uxArtifacts?.uxConstraints) ? control?.uxArtifacts?.uxConstraints ?? [] : [],
      updatedAt: typeof control?.uxArtifacts?.updatedAt === "string" ? control.uxArtifacts.updatedAt : ""
    }
  };
}

export function normalizeConstraintsDomainTrace(control: IterationChangeControl | undefined) {
  return {
    executableConstraints: {
      componentWhitelist: Array.isArray(control?.executableConstraints?.componentWhitelist)
        ? control?.executableConstraints?.componentWhitelist ?? []
        : [],
      codePathWhitelist: Array.isArray(control?.executableConstraints?.codePathWhitelist)
        ? control?.executableConstraints?.codePathWhitelist ?? []
        : [],
      acceptanceChecks: Array.isArray(control?.executableConstraints?.acceptanceChecks)
        ? control?.executableConstraints?.acceptanceChecks ?? []
        : [],
      generatedAt: typeof control?.executableConstraints?.generatedAt === "string" ? control.executableConstraints.generatedAt : ""
    },
    traceabilitySnapshot: {
      requirementCoverage: Number.isFinite(control?.traceabilitySnapshot?.requirementCoverage)
        ? Number(control?.traceabilitySnapshot?.requirementCoverage)
        : 0,
      mappingConfidence:
        control?.traceabilitySnapshot?.mappingConfidence === "high" ||
        control?.traceabilitySnapshot?.mappingConfidence === "medium" ||
        control?.traceabilitySnapshot?.mappingConfidence === "low"
          ? control.traceabilitySnapshot.mappingConfidence
          : "low",
      unmappedRequirements: Array.isArray(control?.traceabilitySnapshot?.unmappedRequirements)
        ? control?.traceabilitySnapshot?.unmappedRequirements ?? []
        : [],
      conflicts: Array.isArray(control?.traceabilitySnapshot?.conflicts) ? control?.traceabilitySnapshot?.conflicts ?? [] : [],
      generatedAt: typeof control?.traceabilitySnapshot?.generatedAt === "string" ? control.traceabilitySnapshot.generatedAt : ""
    },
    domainKnowledgeEntries: Array.isArray(control?.domainKnowledgeEntries)
      ? (control?.domainKnowledgeEntries ?? [])
          .map((item) => ({
            term: typeof item?.term === "string" ? item.term : "",
            definition: typeof item?.definition === "string" ? item.definition : "",
            mappedPages: Array.isArray(item?.mappedPages) ? item.mappedPages.filter((v) => typeof v === "string") : [],
            mappedApis: Array.isArray(item?.mappedApis) ? item.mappedApis.filter((v) => typeof v === "string") : [],
            mappedEntities: Array.isArray(item?.mappedEntities) ? item.mappedEntities.filter((v) => typeof v === "string") : [],
            mappedCodePaths: Array.isArray(item?.mappedCodePaths) ? item.mappedCodePaths.filter((v) => typeof v === "string") : [],
            evidence: typeof item?.evidence === "string" ? item.evidence : ""
          }))
          .filter((item) => item.term || item.definition)
      : [],
    domainKnowledgeUpdatedAt: typeof control?.domainKnowledgeUpdatedAt === "string" ? control.domainKnowledgeUpdatedAt : ""
  };
}

export function normalizeReportMetrics(control: IterationChangeControl | undefined) {
  return {
    lastAnalysisP0Count: Number.isFinite(control?.lastAnalysisP0Count) ? Number(control?.lastAnalysisP0Count) : 0,
    lastAnalysisHighValueCount: Number.isFinite(control?.lastAnalysisHighValueCount) ? Number(control?.lastAnalysisHighValueCount) : 0,
    lastAnalysisConsideredFiles: Number.isFinite(control?.lastAnalysisConsideredFiles) ? Number(control?.lastAnalysisConsideredFiles) : 0,
    lastAnalysisIgnoredFiles: Number.isFinite(control?.lastAnalysisIgnoredFiles) ? Number(control?.lastAnalysisIgnoredFiles) : 0,
    lastAnalysisIgnoredFileRatio: Number.isFinite(control?.lastAnalysisIgnoredFileRatio) ? Number(control?.lastAnalysisIgnoredFileRatio) : 0,
    lastReleaseReviewDecision:
      control?.lastReleaseReviewDecision === "go" || control?.lastReleaseReviewDecision === "caution" || control?.lastReleaseReviewDecision === "block"
        ? control.lastReleaseReviewDecision
        : "",
    lastReleaseReviewReason: typeof control?.lastReleaseReviewReason === "string" ? control.lastReleaseReviewReason : "",
    lastReleaseReviewBlockers: Array.isArray(control?.lastReleaseReviewBlockers) ? control.lastReleaseReviewBlockers : [],
    lastReleaseReviewScore: Number.isFinite(control?.lastReleaseReviewScore) ? Number(control?.lastReleaseReviewScore) : 0,
    lastReleaseReviewUpdatedAt: typeof control?.lastReleaseReviewUpdatedAt === "string" ? control.lastReleaseReviewUpdatedAt : "",
    lastTraceabilityCoverageScore: Number.isFinite(control?.lastTraceabilityCoverageScore) ? Number(control?.lastTraceabilityCoverageScore) : 0,
    lastOpsRollbackSuggested: Boolean(control?.lastOpsRollbackSuggested),
    lastReportPublishable: Boolean(control?.lastReportPublishable),
    lastReportQualityScore: Number.isFinite(control?.lastReportQualityScore) ? Number(control?.lastReportQualityScore) : 0,
    lastReportQualitySummary: typeof control?.lastReportQualitySummary === "string" ? control.lastReportQualitySummary : "",
    lastReportQualityUpdatedAt: typeof control?.lastReportQualityUpdatedAt === "string" ? control.lastReportQualityUpdatedAt : ""
  };
}

export function normalizeBusinessAndInsights(control: IterationChangeControl | undefined) {
  return {
    lastBusinessConfirmation: {
      coreIntent: typeof control?.lastBusinessConfirmation?.coreIntent === "string" ? control.lastBusinessConfirmation.coreIntent : "",
      boundarySummary: typeof control?.lastBusinessConfirmation?.boundarySummary === "string" ? control.lastBusinessConfirmation.boundarySummary : "",
      functionalPoints: Array.isArray(control?.lastBusinessConfirmation?.functionalPoints) ? control.lastBusinessConfirmation.functionalPoints : [],
      successCriteria: Array.isArray(control?.lastBusinessConfirmation?.successCriteria) ? control.lastBusinessConfirmation.successCriteria : [],
      confirmationChecklist: Array.isArray(control?.lastBusinessConfirmation?.confirmationChecklist) ? control.lastBusinessConfirmation.confirmationChecklist : [],
      versionDiffSummary: typeof control?.lastBusinessConfirmation?.versionDiffSummary === "string" ? control.lastBusinessConfirmation.versionDiffSummary : "",
      necessityAssessment: {
        mustDo: Array.isArray(control?.lastBusinessConfirmation?.necessityAssessment?.mustDo) ? control.lastBusinessConfirmation.necessityAssessment.mustDo : [],
        shouldDo: Array.isArray(control?.lastBusinessConfirmation?.necessityAssessment?.shouldDo) ? control.lastBusinessConfirmation.necessityAssessment.shouldDo : [],
        canDefer: Array.isArray(control?.lastBusinessConfirmation?.necessityAssessment?.canDefer) ? control.lastBusinessConfirmation.necessityAssessment.canDefer : [],
        outOfScope: Array.isArray(control?.lastBusinessConfirmation?.necessityAssessment?.outOfScope) ? control.lastBusinessConfirmation.necessityAssessment.outOfScope : [],
        rationale: typeof control?.lastBusinessConfirmation?.necessityAssessment?.rationale === "string" ? control.lastBusinessConfirmation.necessityAssessment.rationale : "",
      },
      interactionInsights: {
        primaryFlow: Array.isArray(control?.lastBusinessConfirmation?.interactionInsights?.primaryFlow) ? control.lastBusinessConfirmation.interactionInsights.primaryFlow : [],
        keyInteractions: Array.isArray(control?.lastBusinessConfirmation?.interactionInsights?.keyInteractions) ? control.lastBusinessConfirmation.interactionInsights.keyInteractions : [],
        exceptionPaths: Array.isArray(control?.lastBusinessConfirmation?.interactionInsights?.exceptionPaths) ? control.lastBusinessConfirmation.interactionInsights.exceptionPaths : [],
        usabilityRisks: Array.isArray(control?.lastBusinessConfirmation?.interactionInsights?.usabilityRisks) ? control.lastBusinessConfirmation.interactionInsights.usabilityRisks : [],
      },
      diffNarratives: Array.isArray(control?.lastBusinessConfirmation?.diffNarratives) ? control.lastBusinessConfirmation.diffNarratives : [],
    },
    lastMeaningfulFindings: Array.isArray(control?.lastMeaningfulFindings) ? control.lastMeaningfulFindings : [],
    lastPrioritizedFindings: Array.isArray(control?.lastPrioritizedFindings)
      ? control.lastPrioritizedFindings.map((item: Record<string, unknown>) => ({
          priority: typeof item?.priority === "string" ? item.priority : "",
          content: typeof item?.content === "string" ? item.content : "",
          reason: typeof item?.reason === "string" ? item.reason : "",
        }))
      : [],
    lastDeepInsightsSummary: {
      themes: Array.isArray(control?.lastDeepInsightsSummary?.themes) ? control.lastDeepInsightsSummary.themes : [],
      gaps: Array.isArray(control?.lastDeepInsightsSummary?.gaps) ? control.lastDeepInsightsSummary.gaps : [],
      rootCauses: Array.isArray(control?.lastDeepInsightsSummary?.rootCauses) ? control.lastDeepInsightsSummary.rootCauses : [],
      decisionSuggestions: Array.isArray(control?.lastDeepInsightsSummary?.decisionSuggestions) ? control.lastDeepInsightsSummary.decisionSuggestions : [],
    }
  };
}
