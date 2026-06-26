import type { KnowledgeEntry } from "../domain/workspace/knowledgeTypes";
import type { KnowledgeGraphCache } from "../domain/workspace/knowledgeGraphTypes";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "../shared/apiConfig";

export async function fetchKnowledgeEntries(projectId: number, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return fetchJSON<KnowledgeEntry[]>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge${query}`);
}

export async function createKnowledgeEntry(projectId: number, payload: { title: string; content: string; category: string; groupName?: string; applicableScene?: string; tags?: string[]; source?: string; sourceRef?: string; iterationId?: number | null }) {
  return fetchJSON<KnowledgeEntry>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateKnowledgeEntry(projectId: number, entryId: number, payload: Partial<KnowledgeEntry>) {
  return fetchJSON<KnowledgeEntry>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge/${entryId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteKnowledgeEntry(projectId: number, entryId: number) {
  return fetchJSON<{ deleted: boolean }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge/${entryId}`, {
    method: "DELETE"
  });
}

export async function publishKnowledgeEntry(projectId: number, entryId: number) {
  return fetchJSON<KnowledgeEntry>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge/${entryId}/publish`, {
    method: "POST"
  });
}

export async function searchKnowledgeEntries(projectId: number, query: string) {
  return fetchJSON<KnowledgeEntry[]>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge/search?q=${encodeURIComponent(query)}`);
}

export async function fetchKnowledgeGraph(projectId: number) {
  return fetchJSON<KnowledgeGraphCache | { graphData: null }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge/graph`);
}

export async function generateKnowledgeGraph(projectId: number) {
  return fetchJSON<KnowledgeGraphCache>(`${API_BASE}${API_PREFIX}/projects/${projectId}/knowledge/graph/generate`, { method: "POST" });
}
