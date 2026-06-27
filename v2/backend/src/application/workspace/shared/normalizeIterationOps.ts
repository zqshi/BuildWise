import type {
  ContinuityMeta,
  Iteration,
  IterationChangeBoundary,
  IterationChangeControl,
  IterationCodeLink,
  IterationScope,
  IterationStatus,
  VersionAssessment
} from '../../../domain/workspace/types';
import { normalizeThreePartVersion } from '../../../domain/workspace/versioning';
import { toRepoSlug } from '../../../domain/workspace/repositoryNaming';
import {
  normalizeArtifactStage,
  normalizeArtifactStatus,
  normalizeArtifactGateStatus,
  normalizeArtifactEditCapability,
  fallbackArtifactWorkflow,
  normalizeAnalysisMetadata,
  normalizeClarificationFields,
  normalizeTestQualityUx,
  normalizeConstraintsDomainTrace,
  normalizeReportMetrics,
  normalizeBusinessAndInsights
} from './normalizeChangeControlFields';

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
