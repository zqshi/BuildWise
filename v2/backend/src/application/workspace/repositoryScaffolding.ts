import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, normalize } from "node:path";
import { spawnSync } from "node:child_process";
import type { RepositoryLayoutNode } from "../../domain/workspace/types";

export type ScaffoldRepositoryInput = {
  rootDir: string;
  organization: string;
  repositoryName: string;
  defaultBranch: string;
  layout: RepositoryLayoutNode[];
  initializeGit: boolean;
  createInitialCommit: boolean;
  dryRun: boolean;
};

export type ScaffoldRepositoryResult = {
  repoPath: string;
  createdPaths: string[];
  gitInitialized: boolean;
  commit: string;
  dryRun: boolean;
};

function safeSegment(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function ensureDir(path: string, createdPaths: string[]) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
    createdPaths.push(path);
  }
}

function ensureFile(path: string, content: string, createdPaths: string[]) {
  if (!existsSync(path)) {
    writeFileSync(path, content, "utf-8");
    createdPaths.push(path);
  }
}

function writeScaffoldFiles(repoPath: string, createdPaths: string[]) {
  ensureFile(
    join(repoPath, "README.md"),
    "# Project Repository\n\nThis repository is scaffolded by BuildWise.\n",
    createdPaths
  );
  ensureFile(
    join(repoPath, ".gitignore"),
    "node_modules/\ndist/\n.env\n.DS_Store\ncoverage/\n",
    createdPaths
  );
  ensureFile(
    join(repoPath, ".editorconfig"),
    "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n",
    createdPaths
  );
  ensureFile(
    join(repoPath, "docs", "README.md"),
    "# Docs\n\n- PRD\n- ADR\n- Iteration notes\n",
    createdPaths
  );
  ensureFile(
    join(repoPath, ".github", "workflows", "ci.yml"),
    "name: CI\non: [push, pull_request]\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Placeholder\n        run: echo \"Add project checks\"\n",
    createdPaths
  );
}

function ensureLayout(repoPath: string, layout: RepositoryLayoutNode[], createdPaths: string[]) {
  for (const item of layout) {
    const dirPath = join(repoPath, item.path);
    ensureDir(dirPath, createdPaths);
    const entries = readdirSync(dirPath);
    if (entries.length === 0) {
      ensureFile(join(dirPath, ".gitkeep"), "", createdPaths);
    }
  }
}

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 30_000 });
}

function initGit(repoPath: string, defaultBranch: string, createInitialCommit: boolean): { gitInitialized: boolean; commit: string } {
  const gitDir = join(repoPath, ".git");
  if (!existsSync(gitDir)) {
    const initWithBranch = runGit(["init", "-b", defaultBranch], repoPath);
    if (initWithBranch.status !== 0) {
      const initLegacy = runGit(["init"], repoPath);
      if (initLegacy.status !== 0) {
        throw new Error(`git init failed: ${initLegacy.stderr || initLegacy.stdout}`);
      }
      const checkout = runGit(["checkout", "-b", defaultBranch], repoPath);
      if (checkout.status !== 0) {
        throw new Error(`git checkout -b failed: ${checkout.stderr || checkout.stdout}`);
      }
    }
  }

  if (!createInitialCommit) {
    return { gitInitialized: true, commit: "" };
  }

  const add = runGit(["add", "."], repoPath);
  if (add.status !== 0) {
    throw new Error(`git add failed: ${add.stderr || add.stdout}`);
  }
  const diff = runGit(["status", "--porcelain"], repoPath);
  if (diff.status !== 0) {
    throw new Error(`git status failed: ${diff.stderr || diff.stdout}`);
  }
  if (!diff.stdout.trim()) {
    const head = runGit(["rev-parse", "HEAD"], repoPath);
    return { gitInitialized: true, commit: head.status === 0 ? head.stdout.trim() : "" };
  }
  const commit = runGit(
    ["-c", "user.name=BuildWise Bot", "-c", "user.email=buildwise@local", "commit", "-m", "chore: scaffold repository structure"],
    repoPath
  );
  if (commit.status !== 0) {
    throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }
  const head = runGit(["rev-parse", "HEAD"], repoPath);
  return { gitInitialized: true, commit: head.status === 0 ? head.stdout.trim() : "" };
}

export function scaffoldRepository(input: ScaffoldRepositoryInput): ScaffoldRepositoryResult {
  const org = safeSegment(input.organization, "org");
  const repoName = safeSegment(input.repositoryName, "project-repo");
  const rootDir = resolve(normalize(input.rootDir.trim()));
  if (!rootDir || rootDir === "/" || rootDir === "\\") {
    throw new Error("rootDir must be a non-root absolute path");
  }
  // Block obvious path traversal
  if (input.rootDir.includes("..")) {
    throw new Error("rootDir must not contain path traversal sequences");
  }
  const repoPath = join(rootDir, org, repoName);
  const createdPaths: string[] = [];

  if (input.dryRun) {
    return {
      repoPath,
      createdPaths: [
        join(repoPath, "apps/web"),
        join(repoPath, "apps/api"),
        join(repoPath, "packages/domain"),
        join(repoPath, "docs")
      ],
      gitInitialized: input.initializeGit,
      commit: "",
      dryRun: true
    };
  }

  ensureDir(repoPath, createdPaths);
  for (const parent of ["docs", ".github", join(".github", "workflows")]) {
    ensureDir(join(repoPath, parent), createdPaths);
  }
  ensureLayout(repoPath, input.layout, createdPaths);
  writeScaffoldFiles(repoPath, createdPaths);

  const git = input.initializeGit ? initGit(repoPath, input.defaultBranch, input.createInitialCommit) : { gitInitialized: false, commit: "" };

  return {
    repoPath,
    createdPaths,
    gitInitialized: git.gitInitialized,
    commit: git.commit,
    dryRun: false
  };
}
