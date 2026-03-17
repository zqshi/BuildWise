import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, normalize, sep } from "node:path";
import { normalizeRelPath } from "../../interfaces/http/routes/workspaceRouteUtils";

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function isPathInside(rootPath: string, targetPath: string) {
  const root = normalize(rootPath);
  const target = normalize(targetPath);
  return target === root || target.startsWith(`${root}${sep}`);
}

function isAllowedByWhitelist(path: string, whitelist: string[]) {
  const normalizedPath = normalizeRelPath(path);
  return whitelist.some((rule) => {
    const normalizedRule = normalizeRelPath(rule);
    if (!normalizedRule) {
      return false;
    }
    return normalizedPath === normalizedRule || normalizedPath.startsWith(`${normalizedRule}/`);
  });
}

export function listWorkingTreeChangedPaths(repoPath: string) {
  const status = runGit(["status", "--porcelain"], repoPath);
  if (status.status !== 0) {
    throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  }
  const lines = status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const files = lines
    .map((line) => {
      const raw = line.slice(3).trim();
      if (!raw) {
        return "";
      }
      // Handle rename entries: "old -> new"
      const renamed = raw.includes(" -> ") ? raw.split(" -> ").pop() || "" : raw;
      return normalizeRelPath(renamed);
    })
    .filter(Boolean);
  return Array.from(new Set(files)).sort();
}

export function assertBoundaryWhitelist(params: {
  repoPath: string;
  whitelist: string[];
  changedPaths: string[];
}) {
  const whitelist = params.whitelist.map((item) => normalizeRelPath(item)).filter(Boolean);
  if (whitelist.length === 0) {
    return { ok: true as const, violations: [] as string[] };
  }
  const violations = params.changedPaths.filter((path) => !isAllowedByWhitelist(path, whitelist));
  return {
    ok: violations.length === 0,
    violations
  } as const;
}

export function resolveBoundaryFileCandidates(params: {
  repoPath: string;
  whitelist: string[];
  maxFiles: number;
  allowedExtensions: string[];
}) {
  const { repoPath, whitelist, maxFiles } = params;
  const allowedExt = new Set(params.allowedExtensions.map((item) => item.toLowerCase()));
  const result: string[] = [];

  const visit = (relativePath: string, absolutePath: string) => {
    if (result.length >= maxFiles) {
      return;
    }
    if (!existsSync(absolutePath)) {
      return;
    }
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      const status = runGit(["ls-files", "--full-name", relativePath], repoPath);
      if (status.status !== 0) {
        return;
      }
      const files = status.stdout
        .split("\n")
        .map((item) => normalizeRelPath(item))
        .filter(Boolean);
      for (const file of files) {
        if (result.length >= maxFiles) {
          break;
        }
        const ext = file.includes(".") ? `.${file.split(".").pop() || ""}`.toLowerCase() : "";
        if (!allowedExt.has(ext)) {
          continue;
        }
        if (isAllowedByWhitelist(file, whitelist)) {
          result.push(file);
        }
      }
      return;
    }
    const relPathStatus = runGit(["ls-files", "--full-name", relativePath], repoPath);
    if (relPathStatus.status !== 0 || !relPathStatus.stdout.trim()) {
      return;
    }
    const relPath = normalizeRelPath(relPathStatus.stdout.split("\n")[0] || "");
    if (!relPath) {
      return;
    }
    const ext = relPath.includes(".") ? `.${relPath.split(".").pop() || ""}`.toLowerCase() : "";
    if (!allowedExt.has(ext)) {
      return;
    }
    if (isAllowedByWhitelist(relPath, whitelist)) {
      result.push(relPath);
    }
  };

  for (const item of whitelist) {
    if (result.length >= maxFiles) {
      break;
    }
    const cleaned = normalizeRelPath(item);
    if (!cleaned) {
      continue;
    }
    const absolutePath = join(repoPath, cleaned);
    if (!isPathInside(repoPath, absolutePath)) {
      continue;
    }
    visit(cleaned, absolutePath);
  }

  return Array.from(new Set(result)).slice(0, maxFiles);
}
