import type { Iteration, IterationMessage, IterationScope, IterationStatus, IterationTransition, AssessmentSnapshot, VersionAssessment } from "./iterationTypes";
import type { Project } from "./projectTypes";

export type GovernanceRole = {
  id: "owner" | "pm" | "developer" | "qa" | "viewer";
  name: string;
  permissions: string[];
};

export type GovernancePermissionPoint = {
  key: string;
  title: string;
  module: string;
  sourceType: "page" | "api";
  source: string;
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

export type ProjectPolicyStatus = "draft" | "active" | "archived";

export type ProjectPolicyRecord = {
  id: number;
  projectId: number;
  version: number;
  status: ProjectPolicyStatus;
  strategy: {
    stages: string[];
    gates: Array<{
      stage: string;
      requiredArtifacts: string[];
      requireHumanConfirmation: boolean;
    }>;
    requiredConfirmations: {
      firstIterationGitReport: boolean;
    };
    exceptions: Array<{
      key: string;
      fallbackAction: string;
      requireUserDecision: boolean;
    }>;
    skillsPlan: Array<{
      stage: string;
      skills: string[];
    }>;
  };
  createdBy: string;
  approvedBy: string;
  createdAt: string;
  approvedAt: string;
};

export type ProjectWorkspaceBindingRecord = {
  id: number;
  projectId: number;
  assistantProfile: string;
  agentId: string;
  workspacePath: string;
  runtimeMode: "native" | "bridge";
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PolicyExecutionLogRecord = {
  id: number;
  projectId: number;
  iterationId: number;
  policyVersion: number;
  stage: string;
  action: string;
  result: "success" | "blocked" | "error";
  evidence: string[];
  createdAt: string;
};

export type ProjectRoleBindingRecord = {
  id: number;
  projectId: number;
  userId: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
};

export type TenantMemberBindingRecord = {
  id: number;
  tenantId: string;
  userId: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
};

export type PlatformRoleBindingRecord = {
  id: number;
  userId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceCustomRoleRecord = {
  id: number;
  roleKey: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
  createdAt: string;
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
  projectPolicies: ProjectPolicyRecord[];
  projectWorkspaceBindings: ProjectWorkspaceBindingRecord[];
  policyExecutionLogs: PolicyExecutionLogRecord[];
  projectRoleBindings: ProjectRoleBindingRecord[];
  tenantMemberBindings: TenantMemberBindingRecord[];
  platformRoleBindings: PlatformRoleBindingRecord[];
  governanceCustomRoles: GovernanceCustomRoleRecord[];
};
