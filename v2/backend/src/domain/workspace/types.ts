export type Project = {
  id: number;
  name: string;
  description: string;
  status: string;
  icon?: string;
  iconColor?: string;
  lastUpdated?: string;
};

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

export type Iteration = {
  id: number;
  projectId: number;
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
};

export type ChatRole = "system" | "assistant" | "user";

export type IterationMessage = {
  id: number;
  iterationId: number;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type AttachmentAnalysisReport = {
  iterationId: number;
  iterationName: string;
  fileName: string;
  analyzedAt: string;
  understanding: string;
  versionDiff: {
    baselineIterationName: string;
    added: string[];
    changed: string[];
    removed: string[];
  };
  risks: string[];
  suggestions: string[];
};

export type AttachmentUploadInput = {
  fileName: string;
  mimeType: string;
  size: number;
  excerpt: string;
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
  createdAt: string;
};

export type WorkspaceStore = {
  projects: Project[];
  iterations: Iteration[];
  messages: IterationMessage[];
  snapshots: AssessmentSnapshot[];
  transitions: IterationTransition[];
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
