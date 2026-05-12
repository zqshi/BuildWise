import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "../shared/apiConfig";
import type { ExperiencePolicy, ExperienceExtractionRecord } from "./experienceTypes";
import type { ExperienceSearchResult, CrossProjectInsightsReport } from "./experienceTypes";

export async function fetchPlatformExperiencePolicy() {
  return fetchJSON<ExperiencePolicy>(`${API_BASE}${API_PREFIX}/experience/policy`);
}

export async function updatePlatformExperiencePolicy(payload: Partial<ExperiencePolicy>) {
  return fetchJSON<ExperiencePolicy>(`${API_BASE}${API_PREFIX}/experience/policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchProjectExperiencePolicy(projectId: number) {
  return fetchJSON<ExperiencePolicy>(`${API_BASE}${API_PREFIX}/projects/${projectId}/experience/policy`);
}

export async function updateProjectExperiencePolicy(projectId: number, payload: Partial<ExperiencePolicy>) {
  return fetchJSON<ExperiencePolicy>(`${API_BASE}${API_PREFIX}/projects/${projectId}/experience/policy`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteProjectExperiencePolicy(projectId: number) {
  return fetchJSON<{ message: string }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/experience/policy`, {
    method: "DELETE"
  });
}

export async function fetchExperienceExtractions(projectId: number) {
  return fetchJSON<ExperienceExtractionRecord[]>(`${API_BASE}${API_PREFIX}/projects/${projectId}/experience/extractions`);
}

export async function triggerExperienceScan(projectId: number) {
  return fetchJSON<{ scannedIterations: number; newEntries: number }>(`${API_BASE}${API_PREFIX}/projects/${projectId}/experience/extract`, {
    method: "POST"
  });
}

export async function searchExperienceAcrossProjects(query: string, tenantId: string) {
  const params = new URLSearchParams({ q: query, tenantId });
  return fetchJSON<ExperienceSearchResult[]>(`${API_BASE}${API_PREFIX}/experience/search?${params}`);
}

export async function fetchCrossProjectInsights(tenantId: string) {
  return fetchJSON<CrossProjectInsightsReport>(`${API_BASE}${API_PREFIX}/experience/insights?tenantId=${tenantId}`);
}
