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

export type IterationChangeControl = {
  pendingHumanConfirmation: boolean;
  lastAnalysisAt: string;
  lastAnalysisFileName: string;
  lastAnalysisDigest: string;
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
  generatedTestMatrix: IterationGeneratedTestCase[];
  generatedTestMatrixUpdatedAt: string;
  testMatrixExecutionUpdatedAt: string;
  lastAnalysisP0Count: number;
  lastAnalysisHighValueCount: number;
  lastAnalysisConsideredFiles: number;
  lastAnalysisIgnoredFiles: number;
  lastAnalysisIgnoredFileRatio: number;
  lastReleaseReviewDecision: "go" | "caution" | "block" | "";
  lastReleaseReviewReason: string;
  lastReleaseReviewBlockers: string[];
  lastReleaseReviewUpdatedAt: string;
  lastTraceabilityCoverageScore: number;
  lastOpsRollbackSuggested: boolean;
  boundary: IterationChangeBoundary;
};

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
  };
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
  scope?: IterationScope;
  status?: IterationStatus;
  progress?: number;
  createdAt: string;
};

export type IterationTransition = {
  id: number;
  iterationId: number;
  fromStatus: IterationStatus;
  toStatus: IterationStatus;
  note: string;
  createdAt: string;
};

export type IterationStateMachinePayload = {
  iterationId: number;
  currentStatus: IterationStatus;
  allowedTransitions: IterationStatus[];
  transitionHistory: IterationTransition[];
};

export type ChatRole = "system" | "assistant" | "user";

export type IterationMessage = {
  id: number;
  iterationId: number;
  role: ChatRole;
  content: string;
  createdAt: string;
};
