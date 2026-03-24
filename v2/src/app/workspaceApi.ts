import type {
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse,
  OpsAlertTriageResponse,
  AssessmentPayload,
  AssessmentSnapshot,
  ChatRole,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationMessage,
  ProjectModelBusinessSummaryPayload,
  ProjectModelViewPayload,
  Project,
} from "../domain/workspace/types";
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import type { IterationArtifactStage, IterationArtifactWorkflow } from "../domain/workspace/iterationTypes";
import type { AuditLog, GovernancePermissionPoint, GovernanceRole } from "../domain/workspace/governanceTypes";
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  OpsTriageTemplatePayload,
  ProjectShare,
  ShareAccessPayload,
  TemplateItem,
  TemplateRunHistory,
  TemplateRunResult,
  VersionSnapshot
} from "../domain/workspace/platformTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { API_BASE, API_PREFIX, isApiNotFound } from "./workspaceApiCore";

export * from "./workspaceApiAgentOps";

export async function fetchProjects() {
  const projectDataRaw = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/projects`);
  return ensureArray<Project>(projectDataRaw).filter((item) => !item.deletedAt);
}

export async function createProject(payload: { name: string; description: string }) {
  return fetchJSON<Project>(`${API_BASE}${API_PREFIX}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchProjectRepository(projectId: number) {
  return fetchJSON(`${API_BASE}${API_PREFIX}/projects/${projectId}/repository`);
}

export async function bootstrapProjectRepository(
  projectId: number,
  payload: {
    provider?: "github" | "gitlab" | "gitea" | "bitbucket" | "custom";
    organization?: string;
    name?: string;
    url: string;
    defaultBranch?: string;
    repoMode?: "external_git" | "managed_local" | "hybrid";
    requireRemoteForProduction?: boolean;
    requireRemoteForStaging?: boolean;
  }
) {
  return fetchJSON(`${API_BASE}${API_PREFIX}/projects/${projectId}/repository/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function validateProjectRepositoryRemote(projectId: number, payload: { url: string }) {
  return fetchJSON<{
    ok: true;
    checkedAt: string;
    message: string;
  }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/repository/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchProjectRepositoryStatus(projectId: number) {
  return fetchJSON<{
    projectId: number;
    repoMode: "external_git" | "managed_local" | "hybrid";
    governance: {
      requireRemoteForProduction: boolean;
      requireRemoteForStaging: boolean;
    };
    health: {
      remoteConfigured: boolean;
      remoteReachable: boolean;
      remoteSynced: boolean;
      lastCheckedAt: string;
      lastError: string;
    };
    remote?: unknown;
    workspace?: unknown;
  }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/repository/status`);
}

export async function fetchProjectRepositoryMigrationPlan(projectId: number) {
  return fetchJSON<{
    projectId: number;
    currentMode: "external_git" | "managed_local" | "hybrid";
    targetMode: "hybrid" | "external_git";
    blockers: string[];
    nextAction: string;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      status: "pending" | "ready" | "done" | "blocked";
      action: string;
    }>;
  }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/repository/migration-plan`);
}

export async function configureProjectRepositoryMode(
  projectId: number,
  payload: {
    repoMode?: "external_git" | "managed_local" | "hybrid";
    requireRemoteForProduction?: boolean;
    requireRemoteForStaging?: boolean;
  }
) {
  return fetchJSON(`${API_BASE}${API_PREFIX}/projects/${projectId}/repository/mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteProject(projectId: number) {
  return fetchJSON<{ ok: boolean; projectId: number; deletedAt: string }>(`${API_BASE}${API_PREFIX}/projects/${projectId}`, {
    method: "DELETE"
  });
}

export async function fetchProjectModelBusinessSummary(projectId: number, iterationId?: number) {
  const endpoint =
    typeof iterationId === "number" && iterationId > 0
      ? `${API_BASE}${API_PREFIX}/projects/${projectId}/model/business-summary?iterationId=${iterationId}`
      : `${API_BASE}${API_PREFIX}/projects/${projectId}/model/business-summary`;
  return fetchJSON<ProjectModelBusinessSummaryPayload>(endpoint);
}

export async function fetchProjectModelView(projectId: number, iterationId?: number) {
  const endpoint =
    typeof iterationId === "number" && iterationId > 0
      ? `${API_BASE}${API_PREFIX}/projects/${projectId}/model-view?iterationId=${iterationId}`
      : `${API_BASE}${API_PREFIX}/projects/${projectId}/model-view`;
  return fetchJSON<ProjectModelViewPayload>(endpoint);
}

export async function fetchProjectIterations(projectId: number) {
  const dataRaw = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/projects/${projectId}/iterations`);
  return ensureArray<Iteration>(dataRaw);
}

export async function createIteration(
  projectId: number,
  payload: {
    name: string;
    description: string;
    versionType?: IterationVersionType;
    goals: string[];
    scope: { inScope: string[]; outOfScope: string[]; acceptanceCriteria: string[] };
    aiSummary: string;
  }
) {
  return fetchJSON<Iteration>(`${API_BASE}${API_PREFIX}/projects/${projectId}/iterations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchIterationDetail(iterationId: number) {
  const [messagesRaw, context, assessment, historyRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/messages`),
    fetchJSON<IterationContextPayload>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/context`),
    fetchJSON<AssessmentPayload>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/assessment`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/assessment/history`)
  ]);
  return {
    messages: ensureArray<IterationMessage>(messagesRaw),
    context,
    assessment,
    history: ensureArray<AssessmentSnapshot>(historyRaw)
  };
}

export async function fetchIterationStateMachine(iterationId: number) {
  return fetchJSON<IterationStateMachinePayload>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/state-machine`);
}

export async function transitionIterationState(iterationId: number, payload: { toStatus: string; reason?: string }) {
  return fetchJSON<{ iterationId: number; fromStatus: string; toStatus: string }>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/state/transition`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}

export async function createIterationMessage(iterationId: number, role: ChatRole, content: string) {
  return fetchJSON<IterationMessage>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content })
  });
}

export async function updateIterationInteractionState(
  iterationId: number,
  payload: {
    hasPrototypeAssets: boolean;
    uploadKind?: "documents" | "prototype" | "mixed" | "other";
    lastAttachmentName?: string;
  }
) {
  return fetchJSON<{
    ok: boolean;
    iterationId: number;
    interactionState: {
      hasPrototypeAssets: boolean;
      uploadKind: "documents" | "prototype" | "mixed" | "other";
      lastUpdatedAt: string;
      lastAttachmentName: string;
    };
  }>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/interaction-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateIterationTestMatrixExecution(
  iterationId: number,
  updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
) {
  return fetchJSON<{
    ok: boolean;
    data: Iteration["changeControl"];
    summary: {
      total: number;
      executed: number;
      passed: number;
      failed: number;
      blocked: number;
      skipped: number;
      coverage: number;
      passRate: number;
    };
  }>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/test-matrix/execution`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates })
  });
}

export async function confirmIterationAnalysis(
  iterationId: number,
  payload: {
    accurate: boolean;
    note?: string;
    actor?: string;
    resolvedClarificationQuestions?: string[];
    boundary?: {
      requirementRefs?: string[];
      componentRefs?: string[];
      codePaths?: string[];
      note?: string;
    };
  }
) {
  return fetchJSON(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateIterationBoundary(
  iterationId: number,
  payload: {
    requirementRefs?: string[];
    componentRefs?: string[];
    codePaths?: string[];
    note?: string;
  }
) {
  return fetchJSON(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/boundary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateClarificationDraft(iterationId: number, resolvedQuestions: string[]) {
  return fetchJSON(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolvedQuestions })
  });
}

export async function generateIterationTestArtifacts(iterationId: number) {
  return fetchJSON<IterationTestArtifactsGenerationResponse>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/test-artifacts/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: false })
    }
  );
}

export async function fetchIterationReleaseReview(iterationId: number) {
  return fetchJSON<IterationReleaseReviewResponse>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/release-review`);
}

export async function fetchIterationArtifactWorkflow(iterationId: number) {
  return fetchJSON<IterationArtifactWorkflow>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/artifacts`);
}

export async function saveIterationArtifactDraft(
  iterationId: number,
  artifactId: string,
  payload: { content: string; media?: string[]; actor?: string }
) {
  return fetchJSON<IterationArtifactWorkflow>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function commitIterationArtifact(
  iterationId: number,
  artifactId: string,
  payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }
) {
  return fetchJSON<IterationArtifactWorkflow>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function confirmIterationArtifact(
  iterationId: number,
  artifactId: string,
  payload: { actor?: string; passed?: boolean; note?: string }
) {
  return fetchJSON<IterationArtifactWorkflow>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function appendIterationArtifactToChat(
  iterationId: number,
  artifactId: string,
  payload?: { actor?: string; prompt?: string }
) {
  return fetchJSON<{ workflow: IterationArtifactWorkflow; message: IterationMessage }>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/artifacts/${encodeURIComponent(artifactId)}/add-to-chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    }
  );
}

export async function transitionIterationArtifactStage(
  iterationId: number,
  payload: { toStage: IterationArtifactStage; actor?: string; note?: string }
) {
  return fetchJSON<IterationArtifactWorkflow>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/change-control/stage/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchPlatformOps(_projectId?: number) {
  const [
    templatesRaw,
    templateRunsRaw,
    opsMetrics,
    deploymentsRaw
  ] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/templates`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/templates/runs`),
    fetchJSON<OpsMetricsPayload>(`${API_BASE}${API_PREFIX}/ops/metrics`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/ops/deployments`)
  ]);
  return {
    templates: ensureArray<TemplateItem>(templatesRaw),
    templateRuns: ensureArray<TemplateRunHistory>(templateRunsRaw),
    opsMetrics,
    deployments: ensureArray<DeploymentRecord>(deploymentsRaw)
  };
}

export async function fetchGovernance() {
  const [rolesRaw, auditLogsRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/roles`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/audit-logs?limit=30`)
  ]);
  return {
    roles: ensureArray<GovernanceRole>(rolesRaw),
    auditLogs: ensureArray<AuditLog>(auditLogsRaw)
  };
}

export async function fetchGovernancePermissionPoints() {
  try {
    const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/permission-points`);
    return ensureArray<GovernancePermissionPoint>(data);
  } catch (error) {
    if (isApiNotFound(error)) {
      return [];
    }
    throw error;
  }
}

export async function fetchOpsTriageTemplates(projectId?: number) {
  const path = typeof projectId === "number" && projectId > 0
    ? `${API_BASE}${API_PREFIX}/ops/triage-templates?projectId=${projectId}`
    : `${API_BASE}${API_PREFIX}/ops/triage-templates`;
  return fetchJSON<OpsTriageTemplatePayload>(path);
}

export async function analyzeOpsAlert(payload: {
  projectId: number;
  severity?: "low" | "medium" | "high" | "critical";
  title: string;
  description?: string;
  signals?: string[];
}) {
  return fetchJSON<OpsAlertTriageResponse>(`${API_BASE}${API_PREFIX}/ops/triage/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function upsertOpsTriageTemplate(
  payload: { id?: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note?: string },
  role = "owner"
) {
  return fetchJSON<{ id: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note: string; updatedAt: string }>(
    `${API_BASE}${API_PREFIX}/ops/triage-templates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(payload)
    }
  );
}

export async function deleteOpsTriageTemplate(templateId: string, role = "owner") {
  return fetchJSON<{ ok: boolean }>(`${API_BASE}${API_PREFIX}/ops/triage-templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
}

export async function fetchCollaboration(projectId: number) {
  const [snapshotsRaw, sharesRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/collab/snapshots?projectId=${projectId}`),
    fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/collab/shares?projectId=${projectId}`)
  ]);
  return {
    snapshots: ensureArray<VersionSnapshot>(snapshotsRaw),
    shares: ensureArray<ProjectShare>(sharesRaw)
  };
}

export async function recomputeAssessment(iterationId: number) {
  return fetchJSON<AssessmentPayload>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/assessment/recompute`, {
    method: "POST"
  });
}

export async function restoreAssessment(iterationId: number, snapshotId: number) {
  return fetchJSON<AssessmentPayload>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/assessment/restore/${snapshotId}`, {
    method: "POST"
  });
}

export async function createVersionSnapshot(payload: {
  projectId: number;
  iterationId: number;
  name: string;
  note?: string;
}, role = "owner") {
  return fetchJSON<VersionSnapshot>(`${API_BASE}${API_PREFIX}/collab/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function restoreVersionSnapshot(snapshotId: number, role = "owner") {
  return fetchJSON<{ ok: boolean; snapshotId: number; iterationId: number }>(
    `${API_BASE}${API_PREFIX}/collab/snapshots/${snapshotId}/restore`,
    { method: "POST", headers: { "x-role": role } }
  );
}

export async function createProjectShare(payload: { projectId: number; permission: "read" | "comment"; ttlHours?: number }, role = "owner") {
  return fetchJSON<ProjectShare>(`${API_BASE}${API_PREFIX}/collab/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function runTemplate(templateId: string, projectId: number, parameters: Record<string, string>, role = "owner") {
  return fetchJSON<TemplateRunResult>(`${API_BASE}${API_PREFIX}/templates/${templateId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ projectId, parameters })
  });
}

export async function createDeployment(payload: {
  projectId: number;
  iterationId?: number;
  environment: "staging" | "production";
  version: string;
}, role = "owner") {
  return fetchJSON<DeploymentRecord>(`${API_BASE}${API_PREFIX}/ops/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function transitionDeployment(deploymentId: number, toStatus: "running" | "success" | "failed", role = "owner") {
  return fetchJSON<DeploymentRecord>(`${API_BASE}${API_PREFIX}/ops/deployments/${deploymentId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ toStatus })
  });
}

export async function accessShare(token: string) {
  return fetchJSON<ShareAccessPayload>(`${API_BASE}${API_PREFIX}/collab/share/${token}`);
}

export async function commentByShare(token: string, content: string) {
  return fetchJSON<{ ok: boolean; token: string; comment: string; createdAt: string }>(
    `${API_BASE}${API_PREFIX}/collab/share/${token}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    }
  );
}

export type ProjectPolicyPayload = {
  id: number;
  projectId: number;
  version: number;
  status: "draft" | "active" | "archived";
  strategy: Record<string, unknown>;
  createdBy: string;
  approvedBy: string;
  createdAt: string;
  approvedAt: string;
};

export type GlobalOrchestrationPolicyPayload = ProjectPolicyPayload;

export type ProjectWorkspaceBindingPayload = {
  id: number;
  projectId: number;
  openclawProfile: string;
  agentId: string;
  workspacePath: string;
  runtimeMode: "openclaw-native" | "bridge";
  locked: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRoleBindingPayload = {
  id: number;
  projectId: number;
  userId: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
  updatedAt: string;
};

export type PolicyExecutionLogPayload = {
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

export async function fetchProjectPolicies(projectId: number) {
  return fetchJSON<{ active: ProjectPolicyPayload | null; items: ProjectPolicyPayload[] }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies`);
}

export async function fetchGlobalOrchestrationPolicies() {
  return fetchJSON<{ active: GlobalOrchestrationPolicyPayload | null; items: GlobalOrchestrationPolicyPayload[] }>(
    `${API_BASE}${API_PREFIX}/governance/orchestration/policies`
  );
}

export async function createGlobalOrchestrationPolicyDraft(strategy?: Record<string, unknown>, role = "owner", userId = "admin-1") {
  return fetchJSON<GlobalOrchestrationPolicyPayload>(`${API_BASE}${API_PREFIX}/governance/orchestration/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role, "x-user-id": userId },
    body: JSON.stringify({ strategy: strategy || {} })
  });
}

export async function activateGlobalOrchestrationPolicy(version: number, role = "owner", userId = "admin-1") {
  return fetchJSON<GlobalOrchestrationPolicyPayload>(`${API_BASE}${API_PREFIX}/governance/orchestration/policies/${version}/activate`, {
    method: "POST",
    headers: { "x-role": role, "x-user-id": userId }
  });
}

export async function restoreGlobalOrchestrationPolicyToInitialMode(role = "owner", userId = "admin-1") {
  return fetchJSON<GlobalOrchestrationPolicyPayload>(`${API_BASE}${API_PREFIX}/governance/orchestration/policies/restore-initial`, {
    method: "POST",
    headers: { "x-role": role, "x-user-id": userId }
  });
}

export async function createProjectPolicyDraft(projectId: number, strategy?: Record<string, unknown>, role = "owner", userId = "admin-1") {
  return fetchJSON<ProjectPolicyPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role, "x-user-id": userId },
    body: JSON.stringify({ strategy: strategy || {} })
  });
}

export async function activateProjectPolicy(projectId: number, version: number, role = "owner", userId = "admin-1") {
  return fetchJSON<ProjectPolicyPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies/${version}/activate`, {
    method: "POST",
    headers: { "x-role": role, "x-user-id": userId }
  });
}

export async function restoreProjectPolicyToInitialMode(projectId: number, role = "owner", userId = "admin-1") {
  return fetchJSON<ProjectPolicyPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/policies/restore-initial`, {
    method: "POST",
    headers: { "x-role": role, "x-user-id": userId }
  });
}

export async function bindProjectWorkspace(
  projectId: number,
  payload: {
    openclawProfile: string;
    agentId?: string;
    workspacePath: string;
    runtimeMode?: "openclaw-native" | "bridge";
    locked?: boolean;
  },
  role = "owner",
  userId = "admin-1"
) {
  return fetchJSON<ProjectWorkspaceBindingPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/workspace/bind`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role, "x-user-id": userId },
    body: JSON.stringify(payload)
  });
}

export async function fetchProjectRoleBindings(projectId: number) {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/projects/${projectId}/roles`);
  return ensureArray<ProjectRoleBindingPayload>(data);
}

export async function upsertProjectRoleBinding(
  projectId: number,
  payload: { userId: string; role: "admin" | "member" | "viewer" },
  role = "owner"
) {
  return fetchJSON<ProjectRoleBindingPayload>(`${API_BASE}${API_PREFIX}/projects/${projectId}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function removeProjectRoleBinding(projectId: number, userId: string, role = "owner") {
  return fetchJSON<{ ok: boolean; projectId: number; userId: string }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/roles/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
}

export async function sendOpenclawProjectChat(projectId: number, message: string, role = "owner") {
  return fetchJSON<{
    mode: "openclaw-native";
    profile: string;
    agentId: string;
    workspacePath: string;
    reply: string;
    at: string;
  }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/openclaw/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ message })
  });
}

export type PlatformRoleBindingPayload = {
  id: number;
  userId: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceCustomRolePayload = {
  id: number;
  roleKey: string;
  name: string;
  description: string;
  level: number;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export async function fetchPlatformRoleBindings() {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/platform-role-bindings`);
  return ensureArray<PlatformRoleBindingPayload>(data);
}

export async function upsertPlatformRoleBinding(payload: { userId: string; role: string }, role = "owner") {
  return fetchJSON<PlatformRoleBindingPayload>(`${API_BASE}${API_PREFIX}/governance/platform-role-bindings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function removePlatformRoleBinding(userId: string, role = "owner") {
  return fetchJSON<{ ok: boolean; userId: string }>(`${API_BASE}${API_PREFIX}/governance/platform-role-bindings/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
}

export async function fetchGovernanceCustomRoles() {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/governance/custom-roles`);
  return ensureArray<GovernanceCustomRolePayload>(data);
}

export async function upsertGovernanceCustomRole(
  payload: { roleKey?: string; name: string; description?: string; level?: number; permissions?: string[] },
  role = "owner"
) {
  try {
    return await fetchJSON<GovernanceCustomRolePayload>(`${API_BASE}${API_PREFIX}/governance/custom-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (isApiNotFound(error)) {
      return fetchJSON<GovernanceCustomRolePayload>(`${API_BASE}${API_PREFIX}/governance/custom_roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": role },
        body: JSON.stringify(payload)
      });
    }
    throw error;
  }
}

export type OpenclawIntegrationStatusPayload = {
  runtimeConfigFound: boolean;
  openclawRoot: string;
  openclawEntry: string;
  openclawEntryExists: boolean;
  profile: string;
  agentId: string;
  openclawHome: string;
  openclawHomeWritable: boolean;
  authProfilePath: string;
  authConfigured: boolean;
  modelStatusChecked: boolean;
  modelAuthSource: string;
  integrated: boolean;
  reason: string;
};

export async function fetchOpenclawIntegrationStatus(role = "owner") {
  return fetchJSON<OpenclawIntegrationStatusPayload>(`${API_BASE}${API_PREFIX}/governance/openclaw/status`, {
    headers: { "x-role": role }
  });
}

export async function requestSmsLoginCode(phone: string) {
  return fetchJSON<{ ok: boolean; expireAt: string; debugCode?: string }>(`${API_BASE}${API_PREFIX}/auth/sms/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
}

export async function verifySmsLoginCode(phone: string, code: string) {
  return fetchJSON<{
    ok: boolean;
    user: {
      phone: string;
      platformRole: string;
      workspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer";
    };
    accessToken?: string;
    expiresIn?: number;
  }>(`${API_BASE}${API_PREFIX}/auth/sms/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code })
  });
}

export async function logoutSession() {
  return fetch(`${API_BASE}${API_PREFIX}/auth/logout`, {
    method: "POST",
    credentials: "include"
  });
}

export async function executePolicyStep(iterationId: number, payload: { action?: string; message?: string }) {
  return fetchJSON<{ ok: boolean; gate: { blocked: boolean; stage: string; reason: string; requiredActions: string[] }; policyVersion: number }>(
    `${API_BASE}${API_PREFIX}/iterations/${iterationId}/policy-execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}

export async function fetchIterationPolicyLogs(iterationId: number) {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/iterations/${iterationId}/policy-log`);
  return ensureArray<PolicyExecutionLogPayload>(data);
}

// ---------------------------------------------------------------------------
// OpenClaw Global Conversations (业务助手持久化对话)
// ---------------------------------------------------------------------------

export type OpenclawConversationPayload = {
  id: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type OpenclawGlobalMessagePayload = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function fetchOpenclawConversations() {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/openclaw/conversations`);
  return ensureArray<OpenclawConversationPayload>(data);
}

export async function createOpenclawConversation(title?: string) {
  return fetchJSON<OpenclawConversationPayload>(`${API_BASE}${API_PREFIX}/openclaw/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
}

export async function fetchOpenclawConversationMessages(conversationId: string) {
  const data = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/openclaw/conversations/${conversationId}/messages`);
  return ensureArray<OpenclawGlobalMessagePayload>(data);
}

export async function sendOpenclawConversationMessage(conversationId: string, content: string) {
  return fetchJSON<{ userMessage: OpenclawGlobalMessagePayload; assistantMessage: OpenclawGlobalMessagePayload }>(
    `${API_BASE}${API_PREFIX}/openclaw/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    },
    180000
  );
}
