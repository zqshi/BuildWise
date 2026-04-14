import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { Iteration, IterationChangeControl, IterationCodeLink, Project } from '../../../domain/workspace/types';
import { normalizeProject } from "./workspaceSupport";
import { buildDefaultArtifactWorkflow } from '../quality/defaultArtifactWorkflow';

export function writeAuditLog(repo: WorkspaceRepository, action: string, resource: string, detail: string) {
  const data = repo.read();
  repo.appendAuditLog({
    id: repo.nextId(data.auditLogs),
    actor: "system",
    action,
    resource,
    detail,
    createdAt: new Date().toISOString()
  });
}

export function hasProject(repo: WorkspaceRepository, projectId: number) {
  const project = repo.findProject(projectId);
  if (!project) {
    return false;
  }
  return !normalizeProject(project).deletedAt;
}

export function buildDefaultIterationCodeLink(repo: WorkspaceRepository, iteration: Iteration): IterationCodeLink | null {
  const project = repo.findProject(iteration.projectId);
  const repository = project ? normalizeProject(project).repository : null;
  if (!repository) {
    return null;
  }
  const slug =
    iteration.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `iter-${iteration.id}`;
  return {
    repoId: repository.id,
    branch: `iteration/${iteration.id}-${slug}`,
    tag: iteration.version ? `v${iteration.version}` : `iter-v${iteration.id}`,
    commit: "",
    pr: "",
    paths: [],
    note: "",
    linkedAt: new Date().toISOString()
  };
}

function normalizeTextSet(items: string[] | undefined) {
  const set = new Set<string>();
  if (!Array.isArray(items)) {
    return set;
  }
  for (const raw of items) {
    const item = raw.trim();
    if (item) {
      set.add(item);
    }
  }
  return set;
}

export function listUncoveredAcceptanceCriteria(
  acceptanceCriteria: string[] | undefined,
  acceptanceChecklist: string[] | undefined,
  acceptanceChecks: string[] | undefined
) {
  const required = normalizeTextSet(acceptanceCriteria);
  if (required.size === 0) {
    return [];
  }
  const covered = normalizeTextSet([...(acceptanceChecklist || []), ...(acceptanceChecks || [])]);
  const uncovered: string[] = [];
  for (const item of required) {
    if (!covered.has(item)) {
      uncovered.push(item);
    }
  }
  return uncovered;
}

export function defaultIterationChangeControl(options?: { isFirstIteration?: boolean; hasPreviousIteration?: boolean }): IterationChangeControl {
  const now = new Date().toISOString();
  const defaultArtifactWorkflow = buildDefaultArtifactWorkflow(
    now,
    options?.isFirstIteration ? "first-iteration" : options?.hasPreviousIteration ? "subsequent-iteration" : "generic"
  );
  return {
    pendingHumanConfirmation: false,
    lastAnalysisAt: "",
    lastAnalysisFileName: "",
    lastAnalysisDigest: "",
    lastUploadedInputFingerprint: "",
    lastUploadedAt: "",
    lastFailedAnalysisInput: "",
    lastFailedAnalysisAt: "",
    lastFailedAnalysisError: "",
    lastAttachmentUploadId: "",
    lastAttachmentIngestJobId: "",
    lastAttachmentAnalysisJobId: "",
    lastAttachmentReportId: "",
    clarificationRounds: 0,
    clarificationQuestions: [],
    clarificationDraftResolvedQuestions: [],
    clarificationDraftUpdatedAt: "",
    lastClarificationResolution: {
      resolvedQuestions: [],
      unresolvedQuestions: [],
      updatedAt: ""
    },
    lastClarificationNote: "",
    confirmedAt: "",
    confirmedBy: "",
    generatedTestMatrix: [],
    generatedTestMatrixUpdatedAt: "",
    testMatrixExecutionUpdatedAt: "",
    qualityArtifacts: {
      unitTests: [],
      contractTests: [],
      acceptanceChecklist: [],
      regressionPoints: [],
      materializedFiles: [],
      updatedAt: ""
    },
    uxArtifacts: {
      informationArchitecture: [],
      interactionFlows: [],
      uiStates: [],
      uxConstraints: [],
      updatedAt: ""
    },
    executableConstraints: {
      componentWhitelist: [],
      codePathWhitelist: [],
      acceptanceChecks: [],
      generatedAt: ""
    },
    traceabilitySnapshot: {
      requirementCoverage: 0,
      mappingConfidence: "low",
      unmappedRequirements: [],
      conflicts: [],
      generatedAt: ""
    },
    domainKnowledgeEntries: [],
    domainKnowledgeUpdatedAt: "",
    lastAnalysisP0Count: 0,
    lastAnalysisHighValueCount: 0,
    lastAnalysisConsideredFiles: 0,
    lastAnalysisIgnoredFiles: 0,
    lastAnalysisIgnoredFileRatio: 0,
    lastReleaseReviewDecision: "",
    lastReleaseReviewReason: "",
    lastReleaseReviewBlockers: [],
    lastReleaseReviewScore: 0,
    lastReleaseReviewUpdatedAt: "",
    lastTraceabilityCoverageScore: 0,
    lastOpsRollbackSuggested: false,
    lastReportPublishable: false,
    lastReportQualityScore: 0,
    lastReportQualitySummary: "",
    lastReportQualityUpdatedAt: "",
    lastBusinessConfirmation: {
      coreIntent: "",
      boundarySummary: "",
      functionalPoints: [],
      successCriteria: [],
      confirmationChecklist: [],
      versionDiffSummary: "",
      necessityAssessment: {
        mustDo: [],
        shouldDo: [],
        canDefer: [],
        outOfScope: [],
        rationale: ""
      },
      interactionInsights: {
        primaryFlow: [],
        keyInteractions: [],
        exceptionPaths: [],
        usabilityRisks: []
      },
      diffNarratives: []
    },
    lastMeaningfulFindings: [],
    lastPrioritizedFindings: [],
    lastDeepInsightsSummary: {
      themes: [],
      gaps: [],
      rootCauses: [],
      decisionSuggestions: []
    },
    artifactWorkflow: defaultArtifactWorkflow,
    boundary: {
      requirementRefs: [],
      componentRefs: [],
      codePaths: [],
      note: "",
      updatedAt: ""
    },
    changeSource: {
      type: "unknown",
      rawInput: "",
      attachments: [],
      references: [],
      updatedAt: ""
    },
    knowledgeHits: [],
    knowledgeConflicts: [],
    normalizedFunctionalPoints: [],
    mappingAuditTrail: []
  };
}

export function resolveClarificationSelection(
  allQuestions: string[],
  selectedQuestions: string[] | undefined,
  updatedAt: string
) {
  const selectedSet = new Set(
    Array.isArray(selectedQuestions) ? selectedQuestions.map((item) => item.trim()).filter(Boolean) : []
  );
  const resolvedQuestions = allQuestions.filter((item) => selectedSet.has(item));
  const unresolvedQuestions = allQuestions.filter((item) => !selectedSet.has(item));
  return {
    resolvedQuestions,
    unresolvedQuestions,
    updatedAt
  };
}

export function listProjectsNormalized(repo: WorkspaceRepository): Project[] {
  return repo
    .listProjects()
    .map(normalizeProject)
    .filter((project) => !project.deletedAt);
}

export function normalizeRelPath(input: string) {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("../") || normalized.startsWith("..")) {
    return "";
  }
  return normalized;
}
