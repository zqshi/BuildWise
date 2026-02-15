export type StatusPayload = {
  status: string;
  service: string;
};

export type Project = {
  id: number;
  name: string;
  description: string;
  status: string;
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

export type Iteration = {
  id: number;
  projectId: number;
  name: string;
  description: string;
  goals: string[];
  modules: IterationModule[];
  status: string;
  progress: number;
  createdAt: string;
  createdBy: string;
  current: boolean;
  aiSummary?: string;
  scope: IterationScope;
  continuity: ContinuityMeta;
  assessment: VersionAssessment;
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
  source: "create" | "message" | "manual-recompute" | "restore";
  note: string;
  assessment: VersionAssessment;
  createdAt: string;
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

export type ModelSummaryPayload = {
  stats?: {
    entities?: number;
    rules?: number;
    pages?: number;
    apis?: number;
  };
  updatedAt?: string;
};

export type RuleCompilePayload = {
  compiledAt: string;
  ruleCount: number;
  validRules: number;
  invalidRules: number;
  warnings: string[];
};

export type RuleBindPayload = {
  generatedAt: string;
  bindings: Array<{
    ruleId: string;
    target: string;
    matchedEntities: string[];
    status: "bound" | "unbound";
    reason: string;
  }>;
};

export type SyncReportPayload = {
  generatedAt: string;
  coverageScore: number;
  summary: string;
  projectCount: number;
  iterationCount: number;
  modelEntityCount: number;
  modelRuleCount: number;
  modelPageCount: number;
  impacts: string[];
  risks: string[];
};

export type TracePayload = {
  generatedAt: string;
  items: Array<{
    pageRoute: string;
    apiPath: string;
    relation: string;
    modelRef: string;
    codeRef: string;
    intent: string;
  }>;
};

export type RoadmapPayload = {
  version: string;
  route: string;
  stage: string;
  goal: string;
  generatedAt: string;
  modelContract: {
    apiDeclared: boolean;
    entityDeclared: boolean;
    statusFieldDeclared: boolean;
    entityRef: string;
  };
  runtime: {
    routeRegistered: boolean;
    implementedBy: string;
    workspaceProjectCount: number;
    workspaceIterationCount: number;
  };
  recommendation: string;
};

export type ModelRelationPayload = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: "one_to_one" | "one_to_many" | "many_to_many";
  name?: string;
};
