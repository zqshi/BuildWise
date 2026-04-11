import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

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
    repoMode?: "external_git" | "managed_local" | "hybrid" | "none";
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
    repoMode: "external_git" | "managed_local" | "hybrid" | "none";
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
    currentMode: "external_git" | "managed_local" | "hybrid" | "none";
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
    repoMode?: "external_git" | "managed_local" | "hybrid" | "none";
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
