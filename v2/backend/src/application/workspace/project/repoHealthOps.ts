import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Project } from '../../../domain/workspace/types';

type GitRunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

type GitRunner = (args: string[], cwd: string) => GitRunResult;

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 20_000 });
}

function normalizeGitError(output: string) {
  return output.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function looksLikeRemoteRepositoryUrl(url: string) {
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(url.trim());
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

export function validateRepositoryRemoteUrl(input: { url: string }, runner: GitRunner = runGit) {
  const now = new Date().toISOString();
  const url = input.url.trim();
  if (!url) {
    return {
      ok: false as const,
      checkedAt: now,
      message: "请先填写 Git 仓库地址。"
    };
  }
  if (!looksLikeRemoteRepositoryUrl(url)) {
    return {
      ok: false as const,
      checkedAt: now,
      message: "地址格式不正确，请使用 https://、ssh:// 或 git@ 开头。"
    };
  }
  const probe = runner(["ls-remote", "--heads", url], process.cwd());
  if (probe.status !== 0) {
    return {
      ok: false as const,
      checkedAt: now,
      message: normalizeGitError(probe.stderr || probe.stdout || "git_ls_remote_failed")
    };
  }
  return {
    ok: true as const,
    checkedAt: now,
    message: ""
  };
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
    lastError: remoteReachable ? "" : normalizeGitError(fetchDry.stderr || fetchDry.stdout || "origin is unreachable")
  };
}
