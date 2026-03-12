import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Project } from "../../domain/workspace/types";

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

export function inferRemoteConfigured(projectRepo: NonNullable<Project["repository"]>) {
  if (projectRepo.remote?.status === "provisioned") {
    return true;
  }
  if (!projectRepo.url) {
    return false;
  }
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(projectRepo.url.trim());
}

export function collectRepositoryHealth(projectRepo: NonNullable<Project["repository"]>) {
  const now = new Date().toISOString();
  const fallback = {
    remoteConfigured: inferRemoteConfigured(projectRepo),
    remoteReachable: false,
    remoteSynced: false,
    lastCheckedAt: now,
    lastError: ""
  };
  const repoPath = projectRepo.workspace?.repoPath || "";
  if (!repoPath || !existsSync(repoPath) || !projectRepo.workspace?.gitInitialized) {
    return fallback;
  }
  if (!existsSync(`${repoPath}/.git`)) {
    return {
      ...fallback,
      lastError: "workspace repo is not a git repository"
    };
  }
  const remoteGet = runGit(["remote", "get-url", "origin"], repoPath);
  const remoteConfigured = remoteGet.status === 0 && Boolean(remoteGet.stdout.trim());
  if (!remoteConfigured) {
    return {
      ...fallback,
      remoteConfigured: false,
      lastError: remoteGet.stderr?.trim() || "origin remote not configured"
    };
  }
  const fetchDry = runGit(["ls-remote", "--heads", "origin"], repoPath);
  const remoteReachable = fetchDry.status === 0;
  const branch = (projectRepo.defaultBranch || "main").trim();
  const aheadBehind = runGit(["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`], repoPath);
  let remoteSynced = false;
  if (aheadBehind.status === 0) {
    const [behindRaw, aheadRaw] = aheadBehind.stdout.trim().split(/\s+/);
    const behind = Number.parseInt(behindRaw || "0", 10);
    const ahead = Number.parseInt(aheadRaw || "0", 10);
    remoteSynced = (Number.isFinite(behind) ? behind : 0) === 0 && (Number.isFinite(ahead) ? ahead : 0) === 0;
  }
  return {
    remoteConfigured: true,
    remoteReachable,
    remoteSynced,
    lastCheckedAt: now,
    lastError: remoteReachable ? "" : fetchDry.stderr?.trim() || fetchDry.stdout?.trim() || "origin is unreachable"
  };
}
