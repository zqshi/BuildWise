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

export type GovernanceRole = {
  id: "owner" | "pm" | "developer" | "qa" | "viewer";
  name: string;
  permissions: string[];
};

export type AuditLog = {
  id: number;
  actor: string;
  action: string;
  resource: string;
  detail: string;
  createdAt: string;
};

export type VersionSnapshot = {
  id: number;
  projectId: number;
  iterationId: number;
  name: string;
  note: string;
  status: IterationStatus;
  progress: number;
  scope: IterationScope;
  assessment: VersionAssessment;
  createdAt: string;
};

export type ProjectShare = {
  id: number;
  projectId: number;
  token: string;
  permission: "read" | "comment";
  expiresAt: string;
  createdAt: string;
};

export type DeploymentRecord = {
  id: number;
  projectId: number;
  environment: "staging" | "production";
  version: string;
  status: "queued" | "running" | "success" | "failed";
  createdAt: string;
};

export type TemplateRunRecord = {
  id: number;
  runId: string;
  templateId: string;
  projectId: number;
  parameters: Record<string, string>;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  summary: string;
};

export type WorkspaceStore = {
  projects: Project[];
  iterations: Iteration[];
  messages: IterationMessage[];
  snapshots: AssessmentSnapshot[];
  transitions: IterationTransition[];
  auditLogs: AuditLog[];
  versionSnapshots: VersionSnapshot[];
  projectShares: ProjectShare[];
  deployments: DeploymentRecord[];
  templateRuns: TemplateRunRecord[];
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
