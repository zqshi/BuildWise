import type { Iteration, IterationMessage, IterationScope, IterationStatus, IterationTransition, AssessmentSnapshot, VersionAssessment } from "./iterationTypes";
import type { Project } from "./projectTypes";

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
  iterationId?: number;
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

export type OpsTriageTemplateRecord = {
  id: string;
  projectId?: number;
  category: string;
  keywords: string[];
  commands: string[];
  note: string;
  updatedAt: string;
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
  opsTriageTemplates: OpsTriageTemplateRecord[];
};
