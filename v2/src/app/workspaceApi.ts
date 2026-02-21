import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  IterationVisualEditResponse,
  IterationCoachChatResponse,
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
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import type { AuditLog, GovernanceRole } from "../domain/workspace/governanceTypes";
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
  return ensureArray<Project>(projectDataRaw).filter((item) => !item.deletedAt);
}

export async function createProject(payload: { name: string; description: string }) {
  return fetchJSON<Project>(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteProject(projectId: number) {
  return fetchJSON<{ ok: boolean; projectId: number; deletedAt: string }>(`${API_BASE}/api/projects/${projectId}`, {
    method: "DELETE"
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
    versionType?: IterationVersionType;
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
  }>(`${API_BASE}/api/iterations/${iterationId}/interaction-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function coachIterationMessage(iterationId: number, message: string) {
  return fetchJSON<IterationCoachChatResponse>(`${API_BASE}/api/iterations/${iterationId}/agent-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
}

export async function executeIterationVisualEdit(
  iterationId: number,
  payload: {
    message: string;
    target?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }
) {
  return fetchJSON<IterationVisualEditResponse>(`${API_BASE}/api/iterations/${iterationId}/visual-edit/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function readFileExcerpt(file: File, maxLength = 4000) {
  const textLike = file.type.startsWith("text/") || /json|xml|javascript/.test(file.type);
  if (!textLike) {
    return "";
  }
  try {
    const content = await file.text();
    return content.slice(0, maxLength);
  } catch {
    return "";
  }
}

function getFilePath(file: File) {
  const maybePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
  return maybePath || file.name;
}

async function toAttachmentFileEntry(file: File, withExcerpt = true) {
  return {
    path: getFilePath(file),
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    excerpt: withExcerpt ? await readFileExcerpt(file, 1500) : ""
  };
}

async function submitAttachmentAnalysisJob(iterationId: number, payload: AttachmentUploadInput) {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}/api/iterations/${iterationId}/analysis/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, 45000);
}

async function fetchAttachmentAnalysisJob(iterationId: number, jobId: string) {
  return fetchJSON<AttachmentAnalysisJob>(`${API_BASE}/api/iterations/${iterationId}/analysis/jobs/${encodeURIComponent(jobId)}`, undefined, 45000);
}

async function waitForAttachmentAnalysisJob(
  iterationId: number,
  jobId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
) {
  const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const job = await fetchAttachmentAnalysisJob(iterationId, jobId);
    if (job.status === "succeeded") {
      if (!job.result) {
        throw new Error("analysis job completed without result");
      }
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "analysis job failed");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`analysis job timeout (${timeoutMs}ms)`);
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
    sourceType: "single-file",
    excerpt: await readFileExcerpt(file),
    agentScope: options?.agentScope ?? "full-cycle",
    forceMultiAgent: options?.forceMultiAgent ?? false,
    autoTransition: options?.autoTransition ?? false
  };
  try {
    const createdJob = await submitAttachmentAnalysisJob(iterationId, payload);
    return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId);
  } catch (error) {
    if (isApiNotFound(error)) {
      return fetchJSON<AttachmentAnalysisReport>(`${API_BASE}/api/iterations/${iterationId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, 120000);
    }
    throw error;
  }
}

export async function analyzeIterationAttachmentFolder(
  iterationId: number,
  files: File[],
  options?: { folderName?: string; agentScope?: AttachmentUploadInput["agentScope"]; forceMultiAgent?: boolean; autoTransition?: boolean }
) {
  const normalized = files.filter((item) => item.size >= 0).slice(0, 1000);
  const excerptCandidates = normalized.filter((item) => {
    const fileType = (item.type || "").toLowerCase();
    const name = (item.name || "").toLowerCase();
    return (
      fileType.startsWith("text/") ||
      fileType.includes("json") ||
      fileType.includes("xml") ||
      fileType.includes("javascript") ||
      name.endsWith(".md") ||
      name.endsWith(".txt") ||
      name.endsWith(".json") ||
      name.endsWith(".ts") ||
      name.endsWith(".tsx") ||
      name.endsWith(".js") ||
      name.endsWith(".jsx")
    );
  });
  const excerptPathSet = new Set(excerptCandidates.slice(0, 160).map((item) => getFilePath(item)));
  const entries = await Promise.all(normalized.map((item) => toAttachmentFileEntry(item, excerptPathSet.has(getFilePath(item)))));
  const textEntries = entries.filter((item) => item.excerpt.trim().length > 0);
  const folderName = options?.folderName?.trim() || "uploaded-folder";
  const digest = `strategy=folder-batch;files=${entries.length};textFiles=${textEntries.length};binaryFiles=${entries.length - textEntries.length}`;
  const preview = textEntries
    .slice(0, 3)
    .map((item) => `${item.path}: ${item.excerpt.slice(0, 200)}`)
    .join("\n\n");
  const payload: AttachmentUploadInput = {
    fileName: folderName,
    mimeType: "application/x-directory",
    size: entries.reduce((total, item) => total + item.size, 0),
    sourceType: "folder",
    folderName,
    files: entries,
    excerpt: preview.slice(0, 6000),
    excerptDigest: digest,
    excerptStrategy: "folder-batch",
    agentScope: options?.agentScope ?? "full-cycle",
    forceMultiAgent: options?.forceMultiAgent ?? true,
    autoTransition: options?.autoTransition ?? false
  };
  try {
    const createdJob = await submitAttachmentAnalysisJob(iterationId, payload);
    return waitForAttachmentAnalysisJob(iterationId, createdJob.jobId);
  } catch (error) {
    if (isApiNotFound(error)) {
      return fetchJSON<AttachmentAnalysisReport>(`${API_BASE}/api/iterations/${iterationId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, 120000);
    }
    throw error;
  }
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
  }>(`${API_BASE}/api/iterations/${iterationId}/change-control/test-matrix/execution`, {
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
  return fetchJSON(`${API_BASE}/api/iterations/${iterationId}/change-control/confirm`, {
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
  return fetchJSON(`${API_BASE}/api/iterations/${iterationId}/change-control/boundary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateClarificationDraft(iterationId: number, resolvedQuestions: string[]) {
  return fetchJSON(`${API_BASE}/api/iterations/${iterationId}/change-control/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolvedQuestions })
  });
}

export async function fetchModelOps(_projectId?: number) {
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

export async function fetchOpsTriageTemplates(projectId?: number) {
  const path = typeof projectId === "number" && projectId > 0 ? `/api/ops/triage-templates?projectId=${projectId}` : "/api/ops/triage-templates";
  const payload = await fetchOptionalJSON<OpsTriageTemplatePayload | null>(
    path,
    null,
    "/api/ops/triage-templates"
  );
  return payload ?? { generatedAt: "", templates: [] };
}

export async function upsertOpsTriageTemplate(
  payload: { id?: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note?: string },
  role = "owner"
) {
  return fetchJSON<{ id: string; projectId?: number; category: string; keywords: string[]; commands: string[]; note: string; updatedAt: string }>(
    `${API_BASE}/api/ops/triage-templates`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": role },
      body: JSON.stringify(payload)
    }
  );
}

export async function deleteOpsTriageTemplate(templateId: string, role = "owner") {
  return fetchJSON<{ ok: boolean }>(`${API_BASE}/api/ops/triage-templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
    headers: { "x-role": role }
  });
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
  projectId?: number;
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

export async function deleteModelRelation(relationId: string, _projectId?: number) {
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
  iterationId?: number;
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
