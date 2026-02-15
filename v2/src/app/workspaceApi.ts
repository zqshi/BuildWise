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
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5055";

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
  return fetchJSON<IterationStateMachinePayload>(`${API_BASE}/api/iterations/${iterationId}/state-machine`);
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

export async function analyzeIterationAttachment(iterationId: number, file: File) {
  const payload: AttachmentUploadInput = {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    excerpt: await readFileExcerpt(file)
  };
  return fetchJSON<AttachmentAnalysisReport>(`${API_BASE}/api/iterations/${iterationId}/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchModelOps() {
  const roadmapPaths = [
    "/api/roadmap-v0-1",
    "/api/roadmap-v0-2",
    "/api/roadmap-v0-3",
    "/api/roadmap-v0-4",
    "/api/roadmap-v0-5",
    "/api/roadmap-v0-6",
    "/api/roadmap-v0-7",
    "/api/roadmap-v0-8",
    "/api/roadmap-v0-9",
    "/api/roadmap-v1-0",
    "/api/roadmap-v1-1",
    "/api/roadmap-v1-2"
  ] as const;

  const [modelSummary, modelRelationsRaw, ruleCompile, ruleBind, syncReport, traceReport, roadmapReports] = await Promise.all([
    fetchJSON<ModelSummaryPayload>(`${API_BASE}/api/model`),
    fetchJSON<unknown>(`${API_BASE}/api/model/relations`),
    fetchJSON<RuleCompilePayload>(`${API_BASE}/api/rules/compile`),
    fetchJSON<RuleBindPayload>(`${API_BASE}/api/rules/bind`),
    fetchJSON<SyncReportPayload>(`${API_BASE}/api/sync/report`),
    fetchJSON<TracePayload>(`${API_BASE}/api/trace`),
    Promise.all(roadmapPaths.map((path) => fetchJSON<RoadmapPayload>(`${API_BASE}${path}`)))
  ]);
  return {
    modelSummary,
    modelRelations: ensureArray<ModelRelationPayload>(modelRelationsRaw),
    ruleCompile,
    ruleBind,
    syncReport,
    traceReport,
    roadmapReports
  };
}

export async function fetchGovernance() {
  const [rolesRaw, auditLogsRaw] = await Promise.all([
    fetchJSON<unknown>(`${API_BASE}/api/governance/roles`),
    fetchJSON<unknown>(`${API_BASE}/api/governance/audit-logs?limit=30`)
  ]);
  return {
    roles: ensureArray<GovernanceRole>(rolesRaw),
    auditLogs: ensureArray<AuditLog>(auditLogsRaw)
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
