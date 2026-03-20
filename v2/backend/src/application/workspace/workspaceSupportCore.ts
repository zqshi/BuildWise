import type {
  AttachmentAnalysisReport,
  ContinuityMeta,
  CreateIterationInput,
  Iteration,
  IterationChangeBoundary,
  IterationChangeControl,
  IterationCodeLink,
  IterationScope,
  IterationStatus,
  Project,
  ProjectRepository,
  VersionAssessment
} from "../../domain/workspace/types";
import { normalizeThreePartVersion } from "../../domain/workspace/versioning";
import { toRepoSlug } from "../../domain/workspace/repositoryNaming";
import { iterationStatusTransitions, canTransitionTo, allowedTransitionsFrom, suggestNextTransition } from "../../domain/workspace/iterationStateMachine";

export const iterationStatuses: IterationStatus[] = ["planned", "in-progress", "review", "blocked", "completed"];

export function isIterationStatus(value: string): value is IterationStatus {
  return (iterationStatuses as string[]).includes(value);
}

/** @deprecated Use canTransitionTo / allowedTransitionsFrom from domain layer */
export const statusTransitions: Record<IterationStatus, IterationStatus[]> = iterationStatusTransitions;

export { canTransitionTo, allowedTransitionsFrom, suggestNextTransition };
export function fallbackScope(goals: string[]): IterationScope {
  return {
    inScope: goals,
    outOfScope: [],
    acceptanceCriteria: goals.map((goal) => `${goal} 可演示并通过验收`)
  };
}
export function fallbackContinuity(): ContinuityMeta {
  return {
    inheritedFromIterationId: null,
    inheritedSummary: "首个迭代，无需继承。",
    carriedGoals: [],
    carriedRisks: [],
    carriedDecisions: []
  };
}
export function fallbackAssessment(scope: IterationScope, summary: string): VersionAssessment {
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
export function createDefaultProjectRepository(project: Pick<Project, "id" | "name">): ProjectRepository {
  const now = new Date().toISOString();
  const repoName = toRepoSlug(project.name, `project-${project.id}`);
  return {
    id: `repo-${project.id}`,
    repoMode: "hybrid",
    provider: "github",
    organization: "buildwise",
    name: repoName,
    url: `https://github.com/buildwise/${repoName}`,
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
        repo.repoMode === "external_git" || repo.repoMode === "managed_local" || repo.repoMode === "hybrid" ? repo.repoMode : "hybrid",
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

function normalizeChangeControl(control: IterationChangeControl | undefined): IterationChangeControl {
  const defaultWorkflow = fallbackArtifactWorkflow();
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
    lastAttachmentReportId: control?.lastAttachmentReportId || "",
    clarificationRounds: Number.isInteger(control?.clarificationRounds) ? control!.clarificationRounds! : 0,
    clarificationQuestions: Array.isArray(control?.clarificationQuestions) ? control?.clarificationQuestions : [],
    clarificationDraftResolvedQuestions: Array.isArray(control?.clarificationDraftResolvedQuestions)
      ? control?.clarificationDraftResolvedQuestions
      : [],
    clarificationDraftUpdatedAt: control?.clarificationDraftUpdatedAt || "",
    lastClarificationResolution: {
      resolvedQuestions: Array.isArray(control?.lastClarificationResolution?.resolvedQuestions)
        ? control?.lastClarificationResolution.resolvedQuestions
        : [],
      unresolvedQuestions: Array.isArray(control?.lastClarificationResolution?.unresolvedQuestions)
        ? control?.lastClarificationResolution.unresolvedQuestions
        : [],
      updatedAt: control?.lastClarificationResolution?.updatedAt || ""
    },
    lastClarificationNote: control?.lastClarificationNote || "",
    confirmedAt: control?.confirmedAt || "",
    confirmedBy: control?.confirmedBy || "",
    generatedTestMatrix: Array.isArray(control?.generatedTestMatrix)
      ? control?.generatedTestMatrix
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
      unitTests: Array.isArray(control?.qualityArtifacts?.unitTests) ? control?.qualityArtifacts.unitTests : [],
      contractTests: Array.isArray(control?.qualityArtifacts?.contractTests) ? control?.qualityArtifacts.contractTests : [],
      acceptanceChecklist: Array.isArray(control?.qualityArtifacts?.acceptanceChecklist)
        ? control?.qualityArtifacts.acceptanceChecklist
        : [],
      regressionPoints: Array.isArray(control?.qualityArtifacts?.regressionPoints) ? control?.qualityArtifacts.regressionPoints : [],
      materializedFiles: Array.isArray(control?.qualityArtifacts?.materializedFiles) ? control?.qualityArtifacts.materializedFiles : [],
      updatedAt: typeof control?.qualityArtifacts?.updatedAt === "string" ? control.qualityArtifacts.updatedAt : ""
    },
    uxArtifacts: {
      informationArchitecture: Array.isArray(control?.uxArtifacts?.informationArchitecture)
        ? control?.uxArtifacts.informationArchitecture
        : [],
      interactionFlows: Array.isArray(control?.uxArtifacts?.interactionFlows) ? control?.uxArtifacts.interactionFlows : [],
      uiStates: Array.isArray(control?.uxArtifacts?.uiStates) ? control?.uxArtifacts.uiStates : [],
      uxConstraints: Array.isArray(control?.uxArtifacts?.uxConstraints) ? control?.uxArtifacts.uxConstraints : [],
      updatedAt: typeof control?.uxArtifacts?.updatedAt === "string" ? control.uxArtifacts.updatedAt : ""
    },
    executableConstraints: {
      componentWhitelist: Array.isArray(control?.executableConstraints?.componentWhitelist)
        ? control?.executableConstraints.componentWhitelist
        : [],
      codePathWhitelist: Array.isArray(control?.executableConstraints?.codePathWhitelist)
        ? control?.executableConstraints.codePathWhitelist
        : [],
      acceptanceChecks: Array.isArray(control?.executableConstraints?.acceptanceChecks)
        ? control?.executableConstraints.acceptanceChecks
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
        ? control?.traceabilitySnapshot.unmappedRequirements
        : [],
      conflicts: Array.isArray(control?.traceabilitySnapshot?.conflicts) ? control?.traceabilitySnapshot.conflicts : [],
      generatedAt: typeof control?.traceabilitySnapshot?.generatedAt === "string" ? control.traceabilitySnapshot.generatedAt : ""
    },
    domainKnowledgeEntries: Array.isArray(control?.domainKnowledgeEntries)
      ? control?.domainKnowledgeEntries
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
    domainKnowledgeUpdatedAt: typeof control?.domainKnowledgeUpdatedAt === "string" ? control.domainKnowledgeUpdatedAt : "",
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
    lastReportQualityUpdatedAt: typeof control?.lastReportQualityUpdatedAt === "string" ? control.lastReportQualityUpdatedAt : "",
    artifactWorkflow: {
      activeStage: normalizeArtifactStage(control?.artifactWorkflow?.activeStage || defaultWorkflow.activeStage),
      updatedAt: typeof control?.artifactWorkflow?.updatedAt === "string" ? control.artifactWorkflow.updatedAt : "",
      items: Array.isArray(control?.artifactWorkflow?.items)
        ? control?.artifactWorkflow.items
            .map((item) => ({
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
              draft: {
                content: typeof item?.draft?.content === "string" ? item.draft.content : "",
                media: Array.isArray(item?.draft?.media) ? item.draft.media.filter((entry: unknown) => typeof entry === "string") : [],
                updatedAt: typeof item?.draft?.updatedAt === "string" ? item.draft.updatedAt : "",
                updatedBy: typeof item?.draft?.updatedBy === "string" ? item.draft.updatedBy : ""
              },
              lastConfirmedBy: typeof item?.lastConfirmedBy === "string" ? item.lastConfirmedBy : "",
              lastConfirmedAt: typeof item?.lastConfirmedAt === "string" ? item.lastConfirmedAt : "",
              updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : ""
            }))
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
    },
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
      attachments: Array.isArray(control?.changeSource?.attachments) ? control?.changeSource.attachments.filter((item) => typeof item === "string") : [],
      references: Array.isArray(control?.changeSource?.references) ? control?.changeSource.references.filter((item) => typeof item === "string") : [],
      updatedAt: typeof control?.changeSource?.updatedAt === "string" ? control.changeSource.updatedAt : ""
    },
    knowledgeHits: Array.isArray(control?.knowledgeHits) ? control?.knowledgeHits.filter((item) => typeof item === "string") : [],
    knowledgeConflicts: Array.isArray(control?.knowledgeConflicts) ? control?.knowledgeConflicts.filter((item) => typeof item === "string") : [],
    normalizedFunctionalPoints: Array.isArray(control?.normalizedFunctionalPoints)
      ? control?.normalizedFunctionalPoints.filter((item) => typeof item === "string")
      : [],
    mappingAuditTrail: Array.isArray(control?.mappingAuditTrail)
      ? control?.mappingAuditTrail
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
      : []
  };
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
export function recomputeAssessment(current: Iteration, previous: Iteration | null): VersionAssessment {
  const prevScope = previous?.scope.inScope ?? [];
  const currScope = current.scope.inScope;
  const deltaInScope = [
    ...currScope.filter((item) => !prevScope.includes(item)).map((item) => `+ ${item}`),
    ...prevScope.filter((item) => !currScope.includes(item)).map((item) => `- ${item}`)
  ];
  return {
    baselineIterationId: previous?.id ?? null,
    baselineIterationName: previous?.name ?? "无基线",
    currentSummary: current.assessment.currentSummary || current.aiSummary || "当前迭代已定义范围，待执行交付。",
    deltaInScope,
    resolvedItems: previous ? prevScope.filter((item) => !currScope.includes(item)) : [],
    pendingItems: currScope,
    risks: current.continuity.carriedRisks
  };
}
export function summarizeFromExcerpt(excerpt: string, fallback: string) {
  const clean = excerpt.replace(/\s+/g, " ").trim();
  if (!clean) {
    return fallback;
  }
  return `已解析附件片段，关键内容：${clean.slice(0, 120)}${clean.length > 120 ? "..." : ""}`;
}
export function inferRisksFromExcerpt(excerpt: string) {
  const lowered = excerpt.toLowerCase();
  const risks: string[] = [];
  if (lowered.includes("延期") || lowered.includes("delay")) {
    risks.push("附件提及进度风险，建议补充里程碑缓冲。");
  }
  if (lowered.includes("待确认") || lowered.includes("todo")) {
    risks.push("附件存在待确认项，建议在版本评审前补齐决策。");
  }
  return risks;
}
function mergeList(primary: string[] | undefined, fallback: string[]) {
  if (Array.isArray(primary) && primary.length > 0) {
    return primary;
  }
  return fallback;
}
export function buildMergedIterationPayload(
  payload: CreateIterationInput,
  project: Project | null,
  previous: Iteration | null
) {
  const goals = mergeList(payload.goals, previous?.goals?.length ? previous.goals : [payload.name]);
  const scope = {
    inScope: mergeList(payload.scope?.inScope, previous?.scope?.inScope ?? goals),
    outOfScope: mergeList(payload.scope?.outOfScope, previous?.scope?.outOfScope ?? []),
    acceptanceCriteria: mergeList(
      payload.scope?.acceptanceCriteria,
      previous?.scope?.acceptanceCriteria ?? goals.map((goal) => `${goal} 可演示并通过验收`)
    )
  };
  const continuity = {
    inheritedFromIterationId: previous?.id ?? null,
    inheritedSummary: previous
      ? `继承自 ${previous.name}，并导入项目元信息：${project?.name ?? "未知项目"}`
      : "首个迭代，无需继承。",
    carriedGoals: previous?.assessment.pendingItems?.length ? previous.assessment.pendingItems : previous?.goals ?? [],
    carriedRisks: previous?.assessment.risks ?? [],
    carriedDecisions: previous
      ? [...(previous.continuity.carriedDecisions ?? []), `项目元信息：${project?.name ?? "未知项目"}｜${project?.description ?? "暂无描述"}`]
      : [`项目元信息：${project?.name ?? "未知项目"}｜${project?.description ?? "暂无描述"}`]
  };
  const assessment = {
    baselineIterationId: previous?.id ?? null,
    baselineIterationName: previous?.name ?? "无基线",
    currentSummary:
      payload.aiSummary?.trim() || `基于项目「${project?.name ?? "未命名项目"}」元信息，${payload.name} 继承上版本上下文并进入执行。`,
    deltaInScope: [
      ...scope.inScope.filter((item) => !(previous?.scope.inScope ?? []).includes(item)).map((item) => `+ ${item}`),
      ...(previous?.scope.inScope ?? []).filter((item) => !scope.inScope.includes(item)).map((item) => `- ${item}`)
    ],
    resolvedItems: previous?.scope.inScope.filter((item) => !scope.inScope.includes(item)) ?? [],
    pendingItems: scope.inScope,
    risks: previous?.assessment.risks ?? []
  };
  return {
    ...payload,
    goals,
    scope,
    continuity,
    assessment,
    aiSummary: assessment.currentSummary
  };
}
export function buildDiffLocations(previous: Iteration | null, current: Iteration) {
  const diffLocations: AttachmentAnalysisReport["diffLocations"] = [];
  const pushDimensionDiff = (
    dimension: "goals" | "inScope" | "outOfScope" | "acceptanceCriteria",
    baseline: string[],
    target: string[]
  ) => {
    for (const item of target.filter((value) => !baseline.includes(value))) {
      diffLocations.push({ dimension, changeType: "added", currentItem: item });
    }
    for (const item of baseline.filter((value) => !target.includes(value))) {
      diffLocations.push({ dimension, changeType: "removed", currentItem: item, baselineItem: item });
    }
  };
  pushDimensionDiff("goals", previous?.goals ?? [], current.goals ?? []);
  pushDimensionDiff("inScope", previous?.scope.inScope ?? [], current.scope.inScope ?? []);
  pushDimensionDiff("outOfScope", previous?.scope.outOfScope ?? [], current.scope.outOfScope ?? []);
  pushDimensionDiff("acceptanceCriteria", previous?.scope.acceptanceCriteria ?? [], current.scope.acceptanceCriteria ?? []);
  return diffLocations;
}
