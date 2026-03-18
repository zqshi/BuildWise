export type IterationScope = {
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
};

export type ContinuityMeta = {
  inheritedFromIterationId: number | null;
  inheritedSummary: string;
  carriedGoals: string[];
  carriedRisks: string[];
  carriedDecisions: string[];
};

export type VersionAssessment = {
  baselineIterationId: number | null;
  baselineIterationName: string;
  currentSummary: string;
  deltaInScope: string[];
  resolvedItems: string[];
  pendingItems: string[];
  risks: string[];
};

export type IterationModule = {
  id: string;
  title: string;
  status: string;
};

export type IterationStatus = "planned" | "in-progress" | "review" | "blocked" | "completed";
export type IterationTransitionSource = "manual" | "auto";
export type IterationVersionType = "major" | "minor" | "patch";

export type IterationCodeLink = {
  repoId: string;
  branch: string;
  tag: string;
  commit: string;
  pr: string;
  paths: string[];
  note: string;
  linkedAt: string;
};

export type IterationChangeBoundary = {
  requirementRefs: string[];
  componentRefs: string[];
  codePaths: string[];
  note: string;
  updatedAt: string;
};

export type IterationChangeSourceType =
  | "natural-language"
  | "document"
  | "html"
  | "image"
  | "selection"
  | "history-reference"
  | "mixed"
  | "unknown";

export type IterationChangeSource = {
  type: IterationChangeSourceType;
  rawInput: string;
  attachments: string[];
  references: string[];
  updatedAt: string;
};

export type IterationGeneratedTestCase = {
  type: string;
  caseId: string;
  focus: string;
  expected: string;
  evidence: string;
  executionStatus: "pending" | "passed" | "failed" | "blocked" | "skipped";
  executionUpdatedAt: string;
  executionBy: string;
  executionNote: string;
};

export type IterationQualityArtifacts = {
  unitTests: string[];
  contractTests: string[];
  acceptanceChecklist: string[];
  regressionPoints: string[];
  materializedFiles: string[];
  updatedAt: string;
};

export type IterationUxArtifacts = {
  informationArchitecture: string[];
  interactionFlows: string[];
  uiStates: string[];
  uxConstraints: string[];
  updatedAt: string;
};

export type IterationArtifactStage =
  | "clarification"
  | "scope"
  | "interaction"
  | "development"
  | "testing"
  | "release"
  | "archive";

export type IterationArtifactStatus = "pending" | "partial" | "ready";
export type IterationArtifactGateStatus = "pending" | "passed" | "blocked";
export type IterationArtifactEditCapability = "none" | "rich-text" | "prototype-select";

export type IterationArtifactWorkflowItem = {
  id: string;
  stage: IterationArtifactStage;
  title: string;
  category: string;
  description: string;
  status: IterationArtifactStatus;
  gateStatus: IterationArtifactGateStatus;
  inputVersionRef: number;
  outputVersion: number;
  stale: boolean;
  downstreamImpacts: IterationArtifactStage[];
  source: string;
  editCapability: IterationArtifactEditCapability;
  summary: string;
  evidence: string[];
  draft: {
    content: string;
    media: string[];
    updatedAt: string;
    updatedBy: string;
  };
  lastConfirmedBy: string;
  lastConfirmedAt: string;
  updatedAt: string;
};

export type IterationArtifactWorkflow = {
  activeStage: IterationArtifactStage;
  items: IterationArtifactWorkflowItem[];
  updatedAt: string;
};

// ── IterationChangeControl sub-types (ISP) ──

export type AnalysisState = {
  lastAnalysisAt: string;
  lastAnalysisFileName: string;
  lastAnalysisDigest: string;
  lastUploadedInputFingerprint: string;
  lastUploadedAt: string;
  lastFailedAnalysisInput: string;
  lastFailedAnalysisAt: string;
  lastFailedAnalysisError: string;
  lastAttachmentUploadId: string;
  lastAttachmentIngestJobId: string;
  lastAttachmentAnalysisJobId: string;
  lastAttachmentReportId: string;
  lastAnalysisP0Count: number;
  lastAnalysisHighValueCount: number;
  lastAnalysisConsideredFiles: number;
  lastAnalysisIgnoredFiles: number;
  lastAnalysisIgnoredFileRatio: number;
  lastReportPublishable: boolean;
  lastReportQualityScore: number;
  lastReportQualitySummary: string;
  lastReportQualityUpdatedAt: string;
};

export type ClarificationState = {
  pendingHumanConfirmation: boolean;
  clarificationRounds: number;
  clarificationQuestions: string[];
  clarificationDraftResolvedQuestions: string[];
  clarificationDraftUpdatedAt: string;
  lastClarificationResolution: {
    resolvedQuestions: string[];
    unresolvedQuestions: string[];
    updatedAt: string;
  };
  lastClarificationNote: string;
  confirmedAt: string;
  confirmedBy: string;
};

export type BoundaryState = {
  boundary: IterationChangeBoundary;
  changeSource: IterationChangeSource;
  executableConstraints: {
    componentWhitelist: string[];
    codePathWhitelist: string[];
    acceptanceChecks: string[];
    generatedAt: string;
  };
};

export type TestingState = {
  generatedTestMatrix: IterationGeneratedTestCase[];
  generatedTestMatrixUpdatedAt: string;
  testMatrixExecutionUpdatedAt: string;
  qualityArtifacts: IterationQualityArtifacts;
  uxArtifacts: IterationUxArtifacts;
};

export type TraceabilityState = {
  traceabilitySnapshot: {
    requirementCoverage: number;
    mappingConfidence: "high" | "medium" | "low";
    unmappedRequirements: string[];
    conflicts: string[];
    generatedAt: string;
  };
  lastTraceabilityCoverageScore: number;
  normalizedFunctionalPoints: string[];
  mappingAuditTrail: Array<{
    id: string;
    sourceType: IterationChangeSourceType;
    functionalPoint: string;
    mappingConfidence: "high" | "medium" | "low";
    impactedArtifacts: string[];
    requirementRefs: string[];
    componentRefs: string[];
    codePaths: string[];
    createdAt: string;
  }>;
};

export type DomainKnowledgeState = {
  domainKnowledgeEntries: Array<{
    term: string;
    definition: string;
    mappedPages: string[];
    mappedApis: string[];
    mappedEntities: string[];
    mappedCodePaths: string[];
    evidence: string;
  }>;
  domainKnowledgeUpdatedAt: string;
  knowledgeHits: string[];
  knowledgeConflicts: string[];
};

export type ReleaseState = {
  lastReleaseReviewDecision: "go" | "caution" | "block" | "";
  lastReleaseReviewReason: string;
  lastReleaseReviewBlockers: string[];
  lastReleaseReviewScore: number;
  lastReleaseReviewUpdatedAt: string;
  lastOpsRollbackSuggested: boolean;
  artifactWorkflow: IterationArtifactWorkflow;
};

// ── Backward-compatible composite ──

export type IterationChangeControl = AnalysisState &
  ClarificationState &
  BoundaryState &
  TestingState &
  TraceabilityState &
  DomainKnowledgeState &
  ReleaseState;

export type Iteration = {
  id: number;
  projectId: number;
  version?: string;
  name: string;
  description: string;
  goals: string[];
  modules: IterationModule[];
  status: IterationStatus;
  progress: number;
  createdAt: string;
  createdBy: string;
  current: boolean;
  aiSummary?: string;
  scope: IterationScope;
  continuity: ContinuityMeta;
  assessment: VersionAssessment;
  codeLink?: IterationCodeLink;
  changeControl?: IterationChangeControl;
  interactionState?: {
    hasPrototypeAssets: boolean;
    uploadKind: "documents" | "prototype" | "mixed" | "other";
    lastUpdatedAt: string;
    lastAttachmentName: string;
    gitRequirementIntake?: {
      status: "idle" | "pending-confirmation" | "accepted-read" | "declined" | "read-failed";
      askedAt: string;
      decidedAt: string;
      branch: string;
      repoUrl: string;
      summary: string;
      error: string;
    };
  };
};

export type CreateIterationInput = Partial<Iteration> &
  Pick<Iteration, "name" | "description"> & {
    versionType?: IterationVersionType;
  };

export type IterationContextPayload = {
  iteration: Iteration | null;
  previous: Iteration | null;
  continuity: ContinuityMeta;
  scope: IterationScope;
};

export type AssessmentPayload = {
  iterationId: number;
  iterationName: string;
  assessment: VersionAssessment;
};

export type AssessmentSnapshot = {
  id: number;
  iterationId: number;
  source: "create" | "message" | "manual-recompute" | "restore" | "state-transition";
  note: string;
  assessment: VersionAssessment;
  scope: IterationScope;
  status: IterationStatus;
  progress: number;
  createdAt: string;
};

export type IterationTransition = {
  id: number;
  iterationId: number;
  fromStatus: IterationStatus;
  toStatus: IterationStatus;
  note: string;
  reason: string;
  source: IterationTransitionSource;
  operator: string;
  operatorRole: string;
  createdAt: string;
};

export type IterationStateMachinePayload = {
  iterationId: number;
  currentStatus: IterationStatus;
  allowedTransitions: IterationStatus[];
  transitionHistory: IterationTransition[];
};

export type ChatRole = "system" | "assistant" | "user";
export type ChatSendStatus = "idle" | "sending" | "sent" | "failed";

export type IterationMessage = {
  id: number;
  iterationId: number;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ProductionDeliveryLoopState =
  | "need_prototype_alignment"
  | "need_arch_alignment"
  | "implementing"
  | "repairing"
  | "testing"
  | "ready_for_release";

export type ProductionDeliveryLoop = {
  state: ProductionDeliveryLoopState;
  blockedBy: string[];
  repairActions: string[];
  evidence: string[];
  updatedAt: string;
};
