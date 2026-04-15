import type {
  ContinuityMeta,
  Iteration,
  IterationChangeBoundary,
  IterationChangeControl,
  IterationCodeLink,
  IterationScope,
  IterationStatus,
  Project,
  ProjectRepository,
  VersionAssessment
} from '../../../domain/workspace/types';
import { normalizeThreePartVersion } from '../../../domain/workspace/versioning';
import { toRepoSlug } from '../../../domain/workspace/repositoryNaming';

// ── Fallback builders ──

function fallbackScope(goals: string[]): IterationScope {
  return {
    inScope: goals,
    outOfScope: [],
    acceptanceCriteria: goals.map((goal) => `${goal} 可演示并通过验收`)
  };
}
function fallbackContinuity(): ContinuityMeta {
  return {
    inheritedFromIterationId: null,
    inheritedSummary: "首个迭代，无需继承。",
    carriedGoals: [],
    carriedRisks: [],
    carriedDecisions: []
  };
}
function fallbackAssessment(scope: IterationScope, summary: string): VersionAssessment {
  return {
    baselineIterationId: null,
    baselineIterationName: "无基线",
    currentSummary: summary,
    deltaInScope: scope.inScope,
    resolvedItems: [],
    pendingItems: scope.inScope,
    risks: []
  };
}

// ── Project normalization ──

function defaultRepositoryLayout(): ProjectRepository["layout"] {
  return [
    { path: "apps/web", purpose: "前端应用", required: true },
    { path: "apps/api", purpose: "后端服务", required: true },
    { path: "packages/domain", purpose: "领域模型与用例", required: true },
    { path: "packages/shared", purpose: "跨端共享模块", required: false },
    { path: "docs", purpose: "PRD/ADR/迭代记录", required: true },
    { path: "tests", purpose: "集成与契约测试", required: true },
    { path: "infra", purpose: "部署与环境脚本", required: true },
    { path: ".github/workflows", purpose: "CI/CD 流水线", required: true }
  ];
}
function createDefaultProjectRepository(project: Pick<Project, "id" | "name">): ProjectRepository {
  const now = new Date().toISOString();
  const repoName = toRepoSlug(project.name, `project-${project.id}`);
  return {
    id: `repo-${project.id}`,
    repoMode: "hybrid",
    provider: "github",
    organization: "",
    name: repoName,
    url: "",
    defaultBranch: "main",
    structureVersion: "v1",
    layout: defaultRepositoryLayout(),
    remote: {
      status: "unprovisioned",
      visibility: "private",
      ownerType: "org",
      providerRepoId: "",
      htmlUrl: "",
      cloneUrl: "",
      sshUrl: "",
      lastProvisionedAt: ""
    },
    governance: {
      requireRemoteForProduction: true,
      requireRemoteForStaging: false
    },
    health: {
      remoteConfigured: false,
      remoteReachable: false,
      remoteSynced: false,
      lastCheckedAt: "",
      lastError: ""
    },
    createdAt: now,
    updatedAt: now
  };
}
export function normalizeProject(project: Project): Project {
  const repo = project.repository ?? createDefaultProjectRepository(project);
  return {
    ...project,
    tenantId: typeof project.tenantId === "string" ? project.tenantId.trim() : typeof project.ownerUserId === "string" ? project.ownerUserId.trim() : "",
    ownerUserId: typeof project.ownerUserId === "string" ? project.ownerUserId.trim() : typeof project.tenantId === "string" ? project.tenantId.trim() : "",
    knowledgeBase: {
      ontologyTerms: Array.isArray(project.knowledgeBase?.ontologyTerms) ? project.knowledgeBase?.ontologyTerms : [],
      stableRules: Array.isArray(project.knowledgeBase?.stableRules) ? project.knowledgeBase?.stableRules : [],
      componentInventory: Array.isArray(project.knowledgeBase?.componentInventory) ? project.knowledgeBase?.componentInventory : [],
      codeMap: Array.isArray(project.knowledgeBase?.codeMap) ? project.knowledgeBase?.codeMap : [],
      decisionLog: Array.isArray(project.knowledgeBase?.decisionLog) ? project.knowledgeBase?.decisionLog : [],
      knownRisks: Array.isArray(project.knowledgeBase?.knownRisks) ? project.knowledgeBase?.knownRisks : [],
      changePatterns: Array.isArray(project.knowledgeBase?.changePatterns) ? project.knowledgeBase?.changePatterns : [],
      updatedAt: typeof project.knowledgeBase?.updatedAt === "string" ? project.knowledgeBase.updatedAt : ""
    },
    repository: {
      ...repo,
      repoMode:
        repo.repoMode === "external_git" || repo.repoMode === "managed_local" || repo.repoMode === "hybrid" || repo.repoMode === "none" ? repo.repoMode : "none",
      remote: repo.remote ?? {
        status: "unprovisioned",
        visibility: "private",
        ownerType: "org",
        providerRepoId: "",
        htmlUrl: "",
        cloneUrl: "",
        sshUrl: "",
        lastProvisionedAt: ""
      },
      workspace: repo.workspace ?? {
        rootPath: "",
        repoPath: "",
        gitInitialized: false,
        lastScaffoldedAt: ""
      },
      governance: repo.governance ?? {
        requireRemoteForProduction: true,
        requireRemoteForStaging: false
      },
      health: repo.health ?? {
        remoteConfigured: false,
        remoteReachable: false,
        remoteSynced: false,
        lastCheckedAt: "",
        lastError: ""
      }
    }
  };
}

// ── Iteration normalization sub-functions ──

function normalizeCodeLink(iteration: Iteration, link: IterationCodeLink): IterationCodeLink {
  const slug = toRepoSlug(iteration.name, `iter-${iteration.id}`);
  return {
    repoId: link.repoId || `repo-${iteration.projectId}`,
    branch: link.branch || `iteration/${iteration.id}-${slug}`,
    tag: link.tag || (iteration.version ? `v${normalizeThreePartVersion(iteration.version)}` : `iter-v${iteration.id}`),
    commit: link.commit || "",
    pr: link.pr || "",
    paths: Array.isArray(link.paths) ? link.paths : [],
    note: link.note || "",
    linkedAt: link.linkedAt || new Date().toISOString()
  };
}
function normalizeChangeBoundary(boundary: IterationChangeBoundary | undefined): IterationChangeBoundary {
  return {
    requirementRefs: Array.isArray(boundary?.requirementRefs) ? boundary.requirementRefs : [],
    componentRefs: Array.isArray(boundary?.componentRefs) ? boundary.componentRefs : [],
    codePaths: Array.isArray(boundary?.codePaths) ? boundary.codePaths : [],
    note: boundary?.note || "",
    updatedAt: boundary?.updatedAt || ""
  };
}

function normalizeExecutionStatus(value: unknown): "pending" | "passed" | "failed" | "blocked" | "skipped" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "passed" || status === "failed" || status === "blocked" || status === "skipped") {
    return status;
  }
  return "pending";
}

function normalizeArtifactStage(
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

function normalizeArtifactStatus(value: unknown): "pending" | "partial" | "ready" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "partial" || status === "ready") {
    return status;
  }
  return "pending";
}

function normalizeArtifactGateStatus(value: unknown): "pending" | "passed" | "blocked" {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (status === "passed" || status === "blocked") {
    return status;
  }
  return "pending";
}

function normalizeArtifactEditCapability(value: unknown): "none" | "rich-text" | "prototype-select" {
  const capability = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (capability === "rich-text" || capability === "prototype-select") {
    return capability;
  }
  return "none";
}

function fallbackArtifactWorkflow() {
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

function normalizeAnalysisMetadata(control: IterationChangeControl | undefined) {
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

function normalizeClarificationFields(control: IterationChangeControl | undefined) {
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

function normalizeTestQualityUx(control: IterationChangeControl | undefined) {
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

function normalizeConstraintsDomainTrace(control: IterationChangeControl | undefined) {
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

function normalizeReportMetrics(control: IterationChangeControl | undefined) {
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

function normalizeBusinessAndInsights(control: IterationChangeControl | undefined) {
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

function normalizeArtifactWorkflowItem(item: Record<string, unknown>) {
  return {
    id: typeof item?.id === "string" ? item.id : "",
    stage: normalizeArtifactStage(item?.stage),
    title: typeof item?.title === "string" ? item.title : "",
    category: typeof item?.category === "string" ? item.category : "",
    description: typeof item?.description === "string" ? item.description : "",
    status: normalizeArtifactStatus(item?.status),
    gateStatus: normalizeArtifactGateStatus(item?.gateStatus),
    inputVersionRef: Number.isFinite(item?.inputVersionRef) ? Number(item?.inputVersionRef) : 0,
    outputVersion: Number.isFinite(item?.outputVersion) ? Number(item?.outputVersion) : 0,
    stale: Boolean(item?.stale),
    downstreamImpacts: Array.isArray(item?.downstreamImpacts)
      ? item.downstreamImpacts.map((entry: unknown) => normalizeArtifactStage(entry))
      : [],
    source: typeof item?.source === "string" ? item.source : "",
    editCapability: normalizeArtifactEditCapability(item?.editCapability),
    summary: typeof item?.summary === "string" ? item.summary : "",
    evidence: Array.isArray(item?.evidence) ? item.evidence.filter((entry: unknown) => typeof entry === "string") : [],
    draft: (() => {
      const d = (typeof item?.draft === "object" && item.draft !== null ? item.draft : {}) as Record<string, unknown>;
      return {
        content: typeof d.content === "string" ? d.content : "",
        media: Array.isArray(d.media) ? d.media.filter((entry: unknown) => typeof entry === "string") : [],
        updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
        updatedBy: typeof d.updatedBy === "string" ? d.updatedBy : ""
      };
    })(),
    lastConfirmedBy: typeof item?.lastConfirmedBy === "string" ? item.lastConfirmedBy : "",
    lastConfirmedAt: typeof item?.lastConfirmedAt === "string" ? item.lastConfirmedAt : "",
    updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : ""
  };
}

function normalizeArtifactWorkflowData(
  aw: IterationChangeControl["artifactWorkflow"] | undefined,
  defaultWorkflow: ReturnType<typeof fallbackArtifactWorkflow>
) {
  return {
    activeStage: normalizeArtifactStage(aw?.activeStage || defaultWorkflow.activeStage),
    updatedAt: typeof aw?.updatedAt === "string" ? aw.updatedAt : "",
    items: Array.isArray(aw?.items)
      ? (aw?.items ?? [])
          .map((item) => normalizeArtifactWorkflowItem(item as Record<string, unknown>))
          .filter((item) => item.id)
      : defaultWorkflow.items
          .map((item) => ({
            id: item.id,
            stage: item.stage,
            title: "",
            category: "",
            description: "",
            status: "pending" as const,
            gateStatus: "pending" as const,
            inputVersionRef: 0,
            outputVersion: 0,
            stale: false,
            downstreamImpacts: [],
            source: "",
            editCapability: "none" as const,
            summary: "",
            evidence: [],
            draft: {
              content: "",
              media: [],
              updatedAt: "",
              updatedBy: ""
            },
            lastConfirmedBy: "",
            lastConfirmedAt: "",
            updatedAt: ""
          }))
  };
}

function normalizeSourceAndAudit(control: IterationChangeControl | undefined) {
  return {
    boundary: normalizeChangeBoundary(control?.boundary),
    changeSource: {
      type:
        control?.changeSource?.type === "natural-language" ||
        control?.changeSource?.type === "document" ||
        control?.changeSource?.type === "html" ||
        control?.changeSource?.type === "image" ||
        control?.changeSource?.type === "selection" ||
        control?.changeSource?.type === "history-reference" ||
        control?.changeSource?.type === "mixed" ||
        control?.changeSource?.type === "unknown"
          ? control.changeSource.type
          : "unknown",
      rawInput: typeof control?.changeSource?.rawInput === "string" ? control.changeSource.rawInput : "",
      attachments: Array.isArray(control?.changeSource?.attachments) ? (control?.changeSource?.attachments ?? []).filter((item) => typeof item === "string") : [],
      references: Array.isArray(control?.changeSource?.references) ? (control?.changeSource?.references ?? []).filter((item) => typeof item === "string") : [],
      updatedAt: typeof control?.changeSource?.updatedAt === "string" ? control.changeSource.updatedAt : ""
    },
    knowledgeHits: Array.isArray(control?.knowledgeHits) ? (control?.knowledgeHits ?? []).filter((item) => typeof item === "string") : [],
    knowledgeConflicts: Array.isArray(control?.knowledgeConflicts) ? (control?.knowledgeConflicts ?? []).filter((item) => typeof item === "string") : [],
    normalizedFunctionalPoints: Array.isArray(control?.normalizedFunctionalPoints)
      ? (control?.normalizedFunctionalPoints ?? []).filter((item) => typeof item === "string")
      : [],
    mappingAuditTrail: Array.isArray(control?.mappingAuditTrail)
      ? (control?.mappingAuditTrail ?? [])
          .map((item) => ({
            id: typeof item?.id === "string" ? item.id : "",
            sourceType:
              item?.sourceType === "natural-language" ||
              item?.sourceType === "document" ||
              item?.sourceType === "html" ||
              item?.sourceType === "image" ||
              item?.sourceType === "selection" ||
              item?.sourceType === "history-reference" ||
              item?.sourceType === "mixed" ||
              item?.sourceType === "unknown"
                ? item.sourceType
                : "unknown",
            functionalPoint: typeof item?.functionalPoint === "string" ? item.functionalPoint : "",
            mappingConfidence:
              item?.mappingConfidence === "high" || item?.mappingConfidence === "medium" || item?.mappingConfidence === "low"
                ? item.mappingConfidence
                : "low",
            impactedArtifacts: Array.isArray(item?.impactedArtifacts) ? item.impactedArtifacts.filter((v) => typeof v === "string") : [],
            requirementRefs: Array.isArray(item?.requirementRefs) ? item.requirementRefs.filter((v) => typeof v === "string") : [],
            componentRefs: Array.isArray(item?.componentRefs) ? item.componentRefs.filter((v) => typeof v === "string") : [],
            codePaths: Array.isArray(item?.codePaths) ? item.codePaths.filter((v) => typeof v === "string") : [],
            createdAt: typeof item?.createdAt === "string" ? item.createdAt : ""
          }))
          .filter((item) => item.id || item.functionalPoint)
      : [],
    fullCycleCheckpoint: control?.fullCycleCheckpoint
  };
}

// ── Main normalizeChangeControl + normalizeIteration ──

function normalizeChangeControl(control: IterationChangeControl | undefined): IterationChangeControl {
  const defaultWorkflow = fallbackArtifactWorkflow();
  return {
    ...normalizeAnalysisMetadata(control),
    ...normalizeClarificationFields(control),
    ...normalizeTestQualityUx(control),
    ...normalizeConstraintsDomainTrace(control),
    ...normalizeReportMetrics(control),
    ...normalizeBusinessAndInsights(control),
    artifactWorkflow: normalizeArtifactWorkflowData(control?.artifactWorkflow, defaultWorkflow),
    ...normalizeSourceAndAudit(control)
  } as IterationChangeControl;
}
export function normalizeIteration(iteration: Iteration): Iteration {
  const goals = Array.isArray(iteration.goals) ? iteration.goals : [];
  const scope = iteration.scope ?? fallbackScope(goals);
  const continuity = iteration.continuity ?? fallbackContinuity();
  const summary = iteration.aiSummary || `${iteration.name} 进入执行阶段`;
  const assessment = iteration.assessment ?? fallbackAssessment(scope, summary);
  return {
    ...iteration,
    version: normalizeThreePartVersion(iteration.version),
    goals,
    modules: Array.isArray(iteration.modules) ? iteration.modules : [],
    status: (iteration.status as IterationStatus) || "in-progress",
    scope: {
      inScope: Array.isArray(scope.inScope) ? scope.inScope : [],
      outOfScope: Array.isArray(scope.outOfScope) ? scope.outOfScope : [],
      acceptanceCriteria: Array.isArray(scope.acceptanceCriteria) ? scope.acceptanceCriteria : []
    },
    continuity: {
      inheritedFromIterationId: continuity.inheritedFromIterationId ?? null,
      inheritedSummary: continuity.inheritedSummary || "",
      carriedGoals: Array.isArray(continuity.carriedGoals) ? continuity.carriedGoals : [],
      carriedRisks: Array.isArray(continuity.carriedRisks) ? continuity.carriedRisks : [],
      carriedDecisions: Array.isArray(continuity.carriedDecisions) ? continuity.carriedDecisions : []
    },
    assessment: {
      baselineIterationId: assessment.baselineIterationId ?? null,
      baselineIterationName: assessment.baselineIterationName || "无基线",
      currentSummary: assessment.currentSummary || "",
      deltaInScope: Array.isArray(assessment.deltaInScope) ? assessment.deltaInScope : [],
      resolvedItems: Array.isArray(assessment.resolvedItems) ? assessment.resolvedItems : [],
      pendingItems: Array.isArray(assessment.pendingItems) ? assessment.pendingItems : [],
      risks: Array.isArray(assessment.risks) ? assessment.risks : []
    },
    changeControl: normalizeChangeControl(iteration.changeControl),
    codeLink: iteration.codeLink ? normalizeCodeLink(iteration, iteration.codeLink) : undefined
  };
}
