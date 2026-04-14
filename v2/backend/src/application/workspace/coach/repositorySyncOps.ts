import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { Iteration, IterationCoachChatResponse, Project } from '../../../domain/workspace/types';
import { normalizeProject } from '../shared/workspaceSupport';
import { writeAuditLog } from '../shared/common';

const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 20_000 });
}

function resolveSyncIntervalMs() {
  const envValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.REPO_SYNC_INTERVAL_MS || "";
  const parsed = Number.parseInt(envValue, 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_SYNC_INTERVAL_MS;
}

function hasRemoteTarget(projectRepo: NonNullable<Project["repository"]>) {
  if (projectRepo.remote?.status === "provisioned") {
    return true;
  }
  const url = (projectRepo.url || "").trim();
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(url);
}

function parseAheadBehind(output: string) {
  const [behindRaw, aheadRaw] = output.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw || "0", 10);
  const ahead = Number.parseInt(aheadRaw || "0", 10);
  if (!Number.isFinite(behind) || !Number.isFinite(ahead)) {
    return null;
  }
  return { behind, ahead };
}

function syncFailureResponse(iterationId: number, branch: string, reason: string): IterationCoachChatResponse {
  return {
    iterationId,
    intent: "general",
    reply: `仓库定期同步失败（分支：${branch}）：${reason}。请确认仓库远端配置、网络连通性与权限后重试。`,
    execution: { action: "none", instruction: "", apply: false },
    guidance: {
      uploadRecommended: false,
      suggestedUploadTypes: ["requirements-doc"],
      suggestedActions: ["检查本地仓库是否已绑定 origin", "校验 Git 凭证与远端访问权限", "修复后继续在对话中触发同步"],
      clarificationChecklist: []
    },
    llm: {
      used: false,
      model: "",
      degraded: false,
      reason: "repository-periodic-sync-failed"
    }
  };
}

function buildUpdatedProject(project: Project, health: NonNullable<NonNullable<Project["repository"]>["health"]>) {
  const normalized = normalizeProject(project);
  const projectRepo = normalized.repository;
  if (!projectRepo) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    ...normalized,
    repository: {
      ...projectRepo,
      health,
      updatedAt: now
    }
  };
}

function shouldRunSync(lastCheckedAt: string, intervalMs: number, nowMs: number) {
  if (!lastCheckedAt) {
    return true;
  }
  const lastMs = Date.parse(lastCheckedAt);
  if (!Number.isFinite(lastMs)) {
    return true;
  }
  return nowMs - lastMs >= intervalMs;
}

export function handleCoachPeriodicRepositorySync(params: {
  repo: WorkspaceRepository;
  iteration: Iteration;
}): IterationCoachChatResponse | null {
  const { repo, iteration } = params;
  const project = repo.findProject(iteration.projectId);
  if (!project) {
    return null;
  }
  const normalizedProject = normalizeProject(project);
  const projectRepo = normalizedProject.repository;
  if (!projectRepo?.workspace?.gitInitialized || !projectRepo.workspace.repoPath) {
    return null;
  }
  if (!hasRemoteTarget(projectRepo)) {
    return null;
  }
  const repoPath = projectRepo.workspace.repoPath;
  if (!existsSync(repoPath) || !existsSync(`${repoPath}/.git`)) {
    return null;
  }
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const intervalMs = resolveSyncIntervalMs();
  const previousHealth = projectRepo.health ?? {
    remoteConfigured: false,
    remoteReachable: false,
    remoteSynced: false,
    lastCheckedAt: "",
    lastError: ""
  };
  if (!shouldRunSync(previousHealth.lastCheckedAt, intervalMs, nowMs)) {
    return null;
  }
  const branch = (projectRepo.defaultBranch || "main").trim();
  const remoteGet = runGit(["remote", "get-url", "origin"], repoPath);
  if (remoteGet.status !== 0 || !remoteGet.stdout.trim()) {
    const health = {
      remoteConfigured: false,
      remoteReachable: false,
      remoteSynced: false,
      lastCheckedAt: now,
      lastError: (remoteGet.stderr || remoteGet.stdout || "origin remote not configured").trim().slice(0, 240)
    };
    const updatedProject = buildUpdatedProject(project, health);
    if (updatedProject) {
      repo.updateProject(updatedProject);
    }
    writeAuditLog(repo, "project_repo_periodic_sync_failed", `project:${iteration.projectId}`, `reason=${health.lastError}`);
    return syncFailureResponse(iteration.id, branch, health.lastError);
  }
  const fetch = runGit(["fetch", "origin", branch], repoPath);
  if (fetch.status !== 0) {
    const error = (fetch.stderr || fetch.stdout || "git_fetch_failed").trim().slice(0, 240);
    const health = {
      remoteConfigured: true,
      remoteReachable: false,
      remoteSynced: false,
      lastCheckedAt: now,
      lastError: error
    };
    const updatedProject = buildUpdatedProject(project, health);
    if (updatedProject) {
      repo.updateProject(updatedProject);
    }
    writeAuditLog(repo, "project_repo_periodic_sync_failed", `project:${iteration.projectId}`, `reason=${error}`);
    return syncFailureResponse(iteration.id, branch, error);
  }
  const before = runGit(["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`], repoPath);
  if (before.status !== 0) {
    const error = (before.stderr || before.stdout || "git_rev_list_failed").trim().slice(0, 240);
    const health = {
      remoteConfigured: true,
      remoteReachable: true,
      remoteSynced: false,
      lastCheckedAt: now,
      lastError: error
    };
    const updatedProject = buildUpdatedProject(project, health);
    if (updatedProject) {
      repo.updateProject(updatedProject);
    }
    writeAuditLog(repo, "project_repo_periodic_sync_failed", `project:${iteration.projectId}`, `reason=${error}`);
    return syncFailureResponse(iteration.id, branch, error);
  }
  const aheadBehindBefore = parseAheadBehind(before.stdout);
  if (!aheadBehindBefore) {
    const error = "unable_to_parse_ahead_behind";
    const health = {
      remoteConfigured: true,
      remoteReachable: true,
      remoteSynced: false,
      lastCheckedAt: now,
      lastError: error
    };
    const updatedProject = buildUpdatedProject(project, health);
    if (updatedProject) {
      repo.updateProject(updatedProject);
    }
    writeAuditLog(repo, "project_repo_periodic_sync_failed", `project:${iteration.projectId}`, `reason=${error}`);
    return syncFailureResponse(iteration.id, branch, error);
  }
  if (aheadBehindBefore.behind > 0) {
    const pull = runGit(["pull", "--ff-only", "origin", branch], repoPath);
    if (pull.status !== 0) {
      const error = (pull.stderr || pull.stdout || "git_pull_ff_only_failed").trim().slice(0, 240);
      const health = {
        remoteConfigured: true,
        remoteReachable: true,
        remoteSynced: false,
        lastCheckedAt: now,
        lastError: error
      };
      const updatedProject = buildUpdatedProject(project, health);
      if (updatedProject) {
        repo.updateProject(updatedProject);
      }
      writeAuditLog(repo, "project_repo_periodic_sync_failed", `project:${iteration.projectId}`, `reason=${error}`);
      return syncFailureResponse(iteration.id, branch, error);
    }
    writeAuditLog(repo, "project_repo_periodic_sync_applied", `project:${iteration.projectId}`, `branch=${branch};behind=${aheadBehindBefore.behind}`);
  }
  const after = runGit(["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`], repoPath);
  const aheadBehindAfter = after.status === 0 ? parseAheadBehind(after.stdout) : null;
  const health = {
    remoteConfigured: true,
    remoteReachable: true,
    remoteSynced: Boolean(aheadBehindAfter && aheadBehindAfter.behind === 0 && aheadBehindAfter.ahead === 0),
    lastCheckedAt: now,
    lastError: ""
  };
  const updatedProject = buildUpdatedProject(project, health);
  if (updatedProject) {
    repo.updateProject(updatedProject);
  }
  return null;
}
