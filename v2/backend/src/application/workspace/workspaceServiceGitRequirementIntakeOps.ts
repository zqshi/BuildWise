import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { ProjectRepository } from "../../domain/workspace/types";

type GitReadDecision = "accept" | "decline" | "unknown";

function runGit(args: string[], cwd?: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 30_000 });
}

function isRemoteUrl(url: string) {
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(url.trim());
}

export function hasGitRequirementIntakeTarget(repo: ProjectRepository | null | undefined) {
  if (!repo) {
    return false;
  }
  const url = (repo.url || "").trim();
  const branch = (repo.defaultBranch || "").trim();
  return Boolean(url && branch && isRemoteUrl(url));
}

export function buildGitRequirementIntakePrompt(repo: ProjectRepository) {
  const branch = repo.defaultBranch || "main";
  const url = repo.url || "";
  return [
    "检测到你已配置代码仓库，是否需要我先读取仓库来理解本次版本需求？",
    `- 仓库地址：${url}`,
    `- 读取分支：${branch}`,
    "请直接回复：",
    "- “读取仓库” 或 “是”",
    "- “暂不读取” 或 “否”",
    "若暂不读取，我会引导你继续需求沟通，或上传文档/文件夹来推进分析。"
  ].join("\n");
}

export function detectGitRequirementReadDecision(message: string): GitReadDecision {
  const text = message.trim().toLowerCase();
  if (!text) {
    return "unknown";
  }
  if (/^(no|n|not now|later|否|不用|暂不|先不|不读取仓库|不读取git)$/.test(text) || /(暂不|先不).*(读取|拉取).*(仓库|git)/.test(text)) {
    return "decline";
  }
  if (/^(yes|y|ok|sure|read|go|是|好|可以|读取仓库|读取git|读取代码仓库)$/.test(text) || /读取.*(仓库|git)/.test(text)) {
    return "accept";
  }
  return "unknown";
}

function listFilesRecursive(root: string, rel = "", collector: string[] = []) {
  const dir = resolve(root, rel || ".");
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const nextRel = rel ? join(rel, entry.name) : entry.name;
    const full = join(root, nextRel);
    if (entry.isDirectory()) {
      if (collector.length >= 120) {
        return collector;
      }
      listFilesRecursive(root, nextRel, collector);
      continue;
    }
    collector.push(nextRel);
    if (collector.length >= 120) {
      return collector;
    }
  }
  return collector;
}

function tryReadTextFile(root: string, relPath: string, max = 800): string {
  try {
    const full = join(root, relPath);
    const size = statSync(full).size;
    if (size > 256 * 1024) {
      return "";
    }
    const raw = readFileSync(full, "utf-8").replace(/\s+/g, " ").trim();
    return raw.slice(0, max);
  } catch {
    return "";
  }
}

export function readGitRepositoryRequirementSnapshot(input: {
  repoUrl: string;
  branch: string;
}): {
  ok: boolean;
  branch: string;
  summary: string;
  highlights: string[];
  error: string;
} {
  const repoUrl = input.repoUrl.trim();
  const branch = input.branch.trim() || "main";
  if (!repoUrl || !isRemoteUrl(repoUrl)) {
    return { ok: false, branch, summary: "", highlights: [], error: "invalid_repo_url" };
  }
  const lsRemote = runGit(["ls-remote", "--heads", repoUrl, branch]);
  if (lsRemote.status !== 0) {
    return {
      ok: false,
      branch,
      summary: "",
      highlights: [],
      error: (lsRemote.stderr || lsRemote.stdout || "git_ls_remote_failed").trim().slice(0, 200)
    };
  }
  const checkoutDir = mkdtempSync(join(tmpdir(), "buildwise-git-intake-"));
  try {
    const clone = runGit(["clone", "--depth", "1", "--branch", branch, repoUrl, checkoutDir]);
    if (clone.status !== 0) {
      return {
        ok: false,
        branch,
        summary: "",
        highlights: [],
        error: (clone.stderr || clone.stdout || "git_clone_failed").trim().slice(0, 200)
      };
    }
    const files = listFilesRecursive(checkoutDir).slice(0, 40);
    const readme = files.find((item) => /^readme(\.md|\.txt)?$/i.test(item)) || "";
    const docsCandidate = files.find((item) => /^(docs\/|requirements\/|prd\/)/i.test(item) && /\.(md|txt|rst)$/i.test(item)) || "";
    const packageCandidate = files.find((item) => /(package\.json|pyproject\.toml|go\.mod|Cargo\.toml)$/i.test(item)) || "";
    const highlights = [
      readme ? `README: ${readme}` : "",
      docsCandidate ? `需求文档候选: ${docsCandidate}` : "",
      packageCandidate ? `技术栈线索: ${packageCandidate}` : "",
      `扫描文件数: ${files.length}`
    ].filter(Boolean);
    const readmeText = readme ? tryReadTextFile(checkoutDir, readme, 500) : "";
    const docsText = docsCandidate ? tryReadTextFile(checkoutDir, docsCandidate, 500) : "";
    const summary = [
      "已完成仓库分支快速读取。",
      readmeText ? `README 摘要：${readmeText}` : "",
      docsText ? `文档摘要：${docsText}` : "",
      highlights.length > 0 ? `结构线索：${highlights.join("；")}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    return { ok: true, branch, summary, highlights, error: "" };
  } finally {
    rmSync(checkoutDir, { recursive: true, force: true });
  }
}
