import type {
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse,
  AssessmentPayload,
  AssessmentSnapshot,
  ChatRole,
  Iteration,
  IterationContextPayload,
  IterationStateMachinePayload,
  IterationMessage,
} from "../domain/workspace/types";
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import type { IterationArtifactStage, IterationArtifactWorkflow } from "../domain/workspace/iterationTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export async function fetchProjectIterations(projectId: number) {
  const dataRaw = await fetchJSON<unknown>(`${API_BASE}${API_PREFIX}/projects/${projectId}/iterations`);
  return ensureArray<Iteration>(dataRaw);
}

export async function deleteIteration(projectId: number, iterationId: number) {
  return fetchJSON<{ deleted?: boolean; message?: string; code?: string }>(
    `${API_BASE}${API_PREFIX}/projects/${projectId}/iterations/${iterationId}`,
    { method: "DELETE" }
  );
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
