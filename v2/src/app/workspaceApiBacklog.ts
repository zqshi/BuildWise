import type { BacklogItem } from "../domain/workspace/backlogTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "../shared/apiConfig";

export async function fetchBacklogItems(projectId: number, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return fetchJSON<BacklogItem[]>(`${API_BASE}${API_PREFIX}/projects/${projectId}/backlog${query}`);
}

export async function createBacklogItem(projectId: number, payload: { title: string; description?: string; priority?: string; source?: string; sourceRef?: string; tags?: string[]; iterationId?: number | null }) {
  return fetchJSON<BacklogItem>(`${API_BASE}${API_PREFIX}/projects/${projectId}/backlog`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateBacklogItem(projectId: number, itemId: number, payload: Partial<BacklogItem>) {
  return fetchJSON<BacklogItem>(`${API_BASE}${API_PREFIX}/projects/${projectId}/backlog/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteBacklogItem(projectId: number, itemId: number) {
  return fetchJSON<{ deleted: boolean }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/backlog/${itemId}`, {
    method: "DELETE"
  });
}

export async function assignBacklogItems(projectId: number, itemIds: number[], iterationId: number | null) {
  return fetchJSON<{ updated: number; skipped: number }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/backlog/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds, iterationId })
  });
}
