import type {
  AttachmentUploadInput,
  AttachmentAnalysisReport,
  AssessmentPayload,
  AssessmentSnapshot,
  ChatRole,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationMessage,
  ModelSummaryPayload,
  ModelRelationPayload,
  RoadmapPayload,
  Project,
  RuleBindPayload,
  RuleCompilePayload,
  SyncReportPayload,
  TracePayload
} from "../domain/workspace/types";
import type { AuditLog, GovernanceRole } from "../domain/workspace/governanceTypes";
import type {
  DeploymentRecord,
  OpsMetricsPayload,
  ProjectShare,
  ShareAccessPayload,
  TemplateItem,
  TemplateRunHistory,
  TemplateRunResult,
  VersionSnapshot
} from "../domain/workspace/platformTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5055";
const missingOptionalEndpoints = new Set<string>();

function isApiNotFound(error: unknown) {
  return error instanceof Error && /^API error: 404\b/.test(error.message);
}

async function fetchOptionalJSON<T>(path: string, fallback: T, cacheKey = path): Promise<T> {
  if (missingOptionalEndpoints.has(cacheKey)) {
    return fallback;
  }
  try {
    return await fetchJSON<T>(`${API_BASE}${path}`);
  } catch (error) {
    if (isApiNotFound(error)) {
      missingOptionalEndpoints.add(cacheKey);
      return fallback;
    }
    throw error;
  }
}

export async function fetchProjects() {
  const projectDataRaw = await fetchJSON<unknown>(`${API_BASE}/api/projects`);
  return ensureArray<Project>(projectDataRaw);
}

export async function createProject(payload: { name: string; description: string }) {
  return fetchJSON<Project>(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchProjectIterations(projectId: number) {
  const dataRaw = await fetchJSON<unknown>(`${API_BASE}/api/projects/${projectId}/iterations`);
  return ensureArray<Iteration>(dataRaw);
}

export async function createIteration(
  projectId: number,
  payload: {
    name: string;
    description: string;
    goals: string[];
    scope: { inScope: string[]; outOfScope: string[]; acceptanceCriteria: string[] };
    aiSummary: string;
  }
) {
  return fetchJSON<Iteration>(`${API_BASE}/api/projects/${projectId}/iterations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchIterationDetail(iterationId: number) {
  const [messagesRaw, context, assessment, historyRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}/api/iterations/${iterationId}/messages`),
    fetchJSON<IterationContextPayload>(`${API_BASE}/api/iterations/${iterationId}/context`),
    fetchJSON<AssessmentPayload>(`${API_BASE}/api/iterations/${iterationId}/assessment`),
    fetchJSON<unknown>(`${API_BASE}/api/iterations/${iterationId}/assessment/history`)
  ]);
  return {
    messages: ensureArray<IterationMessage>(messagesRaw),
    context,
    assessment,
    history: ensureArray<AssessmentSnapshot>(historyRaw)
  };
}

export async function fetchIterationStateMachine(iterationId: number) {
  return fetchOptionalJSON<IterationStateMachinePayload | null>(
    `/api/iterations/${iterationId}/state-machine`,
    null,
    "/api/iterations/:id/state-machine"
  );
}

export async function transitionIterationState(iterationId: number, payload: { toStatus: string; note?: string }) {
  return fetchJSON<{ iterationId: number; fromStatus: string; toStatus: string }>(
    `${API_BASE}/api/iterations/${iterationId}/state/transition`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );
}

export async function createIterationMessage(iterationId: number, role: ChatRole, content: string) {
  return fetchJSON<IterationMessage>(`${API_BASE}/api/iterations/${iterationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content })
  });
}

async function readFileExcerpt(file: File) {
  const textLike = file.type.startsWith("text/") || /json|xml|javascript/.test(file.type);
  if (!textLike) {
    return "";
  }
  try {
    const content = await file.text();
    return content.slice(0, 4000);
  } catch {
    return "";
  }
}

export async function analyzeIterationAttachment(
  iterationId: number,
  file: File,
  options?: { agentScope?: AttachmentUploadInput["agentScope"]; forceMultiAgent?: boolean; autoTransition?: boolean }
) {
  const payload: AttachmentUploadInput = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    excerpt: await readFileExcerpt(file),
    agentScope: options?.agentScope ?? "full-cycle",
    forceMultiAgent: options?.forceMultiAgent ?? false,
    autoTransition: options?.autoTransition ?? false
  };
  return fetchJSON<AttachmentAnalysisReport>(`${API_BASE}/api/iterations/${iterationId}/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchModelOps() {
  const [
    modelSummary,
    modelRelationsRaw,
    ruleCompile,
    ruleBind,
    syncReport,
    traceReport,
    roadmapReportsRaw,
    templatesRaw,
    templateRunsRaw,
    opsMetrics,
    deploymentsRaw
  ] = await Promise.all([
    fetchOptionalJSON<ModelSummaryPayload | null>("/api/model", null),
    fetchOptionalJSON<unknown>("/api/model/relations", []),
    fetchOptionalJSON<RuleCompilePayload | null>("/api/rules/compile", null),
    fetchOptionalJSON<RuleBindPayload | null>("/api/rules/bind", null),
    fetchOptionalJSON<SyncReportPayload | null>("/api/sync/report", null),
    fetchOptionalJSON<TracePayload | null>("/api/trace", null),
    fetchOptionalJSON<unknown>("/api/roadmaps", []),
    fetchOptionalJSON<unknown>("/api/templates", []),
    fetchOptionalJSON<unknown>("/api/templates/runs", []),
    fetchOptionalJSON<OpsMetricsPayload | null>("/api/ops/metrics", null),
    fetchOptionalJSON<unknown>("/api/ops/deployments", [])
  ]);
  return {
    modelSummary,
    modelRelations: ensureArray<ModelRelationPayload>(modelRelationsRaw),
    ruleCompile,
    ruleBind,
    syncReport,
    traceReport,
    roadmapReports: ensureArray<RoadmapPayload>(roadmapReportsRaw),
    templates: ensureArray<TemplateItem>(templatesRaw),
    templateRuns: ensureArray<TemplateRunHistory>(templateRunsRaw),
    opsMetrics,
    deployments: ensureArray<DeploymentRecord>(deploymentsRaw)
  };
}

export async function fetchGovernance() {
  const [rolesRaw, auditLogsRaw] = await Promise.all([
    fetchOptionalJSON<unknown>("/api/governance/roles", []),
    fetchOptionalJSON<unknown>("/api/governance/audit-logs?limit=30", [])
  ]);
  return {
    roles: ensureArray<GovernanceRole>(rolesRaw),
    auditLogs: ensureArray<AuditLog>(auditLogsRaw)
  };
}

export async function fetchCollaboration(projectId: number) {
  const [snapshotsRaw, sharesRaw] = await Promise.all([
    fetchOptionalJSON<unknown>(`/api/collab/snapshots?projectId=${projectId}`, []),
    fetchOptionalJSON<unknown>(`/api/collab/shares?projectId=${projectId}`, [])
  ]);
  return {
    snapshots: ensureArray<VersionSnapshot>(snapshotsRaw),
    shares: ensureArray<ProjectShare>(sharesRaw)
  };
}

export async function createModelRelation(payload: {
  fromEntityId: string;
  toEntityId: string;
  type: "one_to_one" | "one_to_many" | "many_to_many";
  name?: string;
}) {
  return fetchJSON<ModelRelationPayload>(`${API_BASE}/api/model/relations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteModelRelation(relationId: string) {
  return fetchJSON<{ ok: boolean; id: string }>(`${API_BASE}/api/model/relations/${relationId}`, {
    method: "DELETE"
  });
}

export async function recomputeAssessment(iterationId: number) {
  return fetchJSON<AssessmentPayload>(`${API_BASE}/api/iterations/${iterationId}/assessment/recompute`, {
    method: "POST"
  });
}

export async function restoreAssessment(iterationId: number, snapshotId: number) {
  return fetchJSON<AssessmentPayload>(`${API_BASE}/api/iterations/${iterationId}/assessment/restore/${snapshotId}`, {
    method: "POST"
  });
}

export async function createVersionSnapshot(payload: {
  projectId: number;
  iterationId: number;
  name: string;
  note?: string;
}, role = "owner") {
  return fetchJSON<VersionSnapshot>(`${API_BASE}/api/collab/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function restoreVersionSnapshot(snapshotId: number, role = "owner") {
  return fetchJSON<{ ok: boolean; snapshotId: number; iterationId: number }>(
    `${API_BASE}/api/collab/snapshots/${snapshotId}/restore`,
    { method: "POST", headers: { "x-role": role } }
  );
}

export async function createProjectShare(payload: { projectId: number; permission: "read" | "comment"; ttlHours?: number }, role = "owner") {
  return fetchJSON<ProjectShare>(`${API_BASE}/api/collab/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function runTemplate(templateId: string, projectId: number, parameters: Record<string, string>, role = "owner") {
  return fetchJSON<TemplateRunResult>(`${API_BASE}/api/templates/${templateId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ projectId, parameters })
  });
}

export async function createDeployment(payload: {
  projectId: number;
  environment: "staging" | "production";
  version: string;
}, role = "owner") {
  return fetchJSON<DeploymentRecord>(`${API_BASE}/api/ops/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify(payload)
  });
}

export async function transitionDeployment(deploymentId: number, toStatus: "running" | "success" | "failed", role = "owner") {
  return fetchJSON<DeploymentRecord>(`${API_BASE}/api/ops/deployments/${deploymentId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-role": role },
    body: JSON.stringify({ toStatus })
  });
}

export async function accessShare(token: string) {
  return fetchJSON<ShareAccessPayload>(`${API_BASE}/api/collab/share/${token}`);
}

export async function commentByShare(token: string, content: string) {
  return fetchJSON<{ ok: boolean; token: string; comment: string; createdAt: string }>(
    `${API_BASE}/api/collab/share/${token}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    }
  );
}
