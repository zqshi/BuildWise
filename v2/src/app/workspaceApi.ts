import type { Project } from "../domain/workspace/types";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { ensureArray } from "../shared/ensureArray";
import { normalizeProjectModelViewPayload } from "./projectModelViewNormalization.ts";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export * from "./workspaceApiAgentOps";
export * from "./workspaceApiRepo";
export * from "./workspaceApiIteration";
export * from "./workspaceApiPlatform";
export * from "./workspaceApiGovernance";
export * from "./workspaceApiPolicy";
export * from "./workspaceApiAuth";
export * from "./workspaceApiBacklog";
export * from "./workspaceApiKnowledge";
export * from "./workspaceApiExperience";
export * from "./workspaceApiAssistant";

// Core project-level functions

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

export async function deleteProject(projectId: number) {
  return fetchJSON<{ ok: boolean; projectId: number; deletedAt: string }>(`${API_BASE}${API_PREFIX}/projects/${projectId}`, {
    method: "DELETE"
  });
}

export async function fetchProjectModelView(projectId: number, iterationId?: number) {
  const endpoint =
    typeof iterationId === "number" && iterationId > 0
      ? `${API_BASE}${API_PREFIX}/projects/${projectId}/model-view?iterationId=${iterationId}`
      : `${API_BASE}${API_PREFIX}/projects/${projectId}/model-view`;
  const payload = await fetchJSON<unknown>(endpoint);
  return normalizeProjectModelViewPayload(payload);
}
