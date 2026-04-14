import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

type Visibility = "private" | "public";
type OwnerType = "org" | "user";

type PublishIterationInput = {
  repoPath: string;
  branch: string;
  baseBranch: string;
  commitMessage: string;
  remoteName: string;
  cloneUrl: string;
  openPr: boolean;
  prTitle: string;
  prBody: string;
  owner: string;
  repo: string;
  visibility: Visibility;
  ownerType: OwnerType;
  githubToken: string;
  dryRun: boolean;
};

type PublishIterationResult = {
  commit: string;
  branch: string;
  pushed: boolean;
  prUrl: string;
  prNumber: number;
  dryRun: boolean;
};

type GitHubPrResponse = {
  number?: number;
  html_url?: string;
};

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8", timeout: 30_000 });
}

function ensureGitRepo(repoPath: string) {
  if (!existsSync(repoPath)) {
    throw new Error(`repoPath does not exist: ${repoPath}`);
  }
  if (!existsSync(join(repoPath, ".git"))) {
    throw new Error(`repoPath is not a git repository: ${repoPath}`);
  }
}

function ensureRemote(repoPath: string, remoteName: string, cloneUrl: string) {
  const remotes = runGit(["remote"], repoPath);
  if (remotes.status !== 0) {
    throw new Error(`git remote failed: ${remotes.stderr || remotes.stdout}`);
  }
  const hasRemote = remotes.stdout
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(remoteName);
  const args = hasRemote ? ["remote", "set-url", remoteName, cloneUrl] : ["remote", "add", remoteName, cloneUrl];
  const setRemote = runGit(args, repoPath);
  if (setRemote.status !== 0) {
    throw new Error(`git remote configure failed: ${setRemote.stderr || setRemote.stdout}`);
  }
}

function performLocalCommit(input: PublishIterationInput): { commit: string } {
  const checkout = runGit(["checkout", "-B", input.branch], input.repoPath);
  if (checkout.status !== 0) {
    throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
  }

  const add = runGit(["add", "-A"], input.repoPath);
  if (add.status !== 0) {
    throw new Error(`git add failed: ${add.stderr || add.stdout}`);
  }

  const commit = runGit(
    [
      "-c",
      "user.name=BuildWise Bot",
      "-c",
      "user.email=buildwise@local",
      "commit",
      "--allow-empty",
      "-m",
      input.commitMessage
    ],
    input.repoPath
  );
  if (commit.status !== 0) {
    throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const rev = runGit(["rev-parse", "HEAD"], input.repoPath);
  if (rev.status !== 0) {
    throw new Error(`git rev-parse failed: ${rev.stderr || rev.stdout}`);
  }
  return { commit: rev.stdout.trim() };
}

async function requestGitHub(
  url: string,
  init: RequestInit,
  token: string
): Promise<{ status: number; body: GitHubPrResponse | GitHubPrResponse[] | null }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${token}`,
      ...(init.headers || {})
    }
  });
  let body: GitHubPrResponse | GitHubPrResponse[] | null = null;
  try {
    body = (await res.json()) as GitHubPrResponse | GitHubPrResponse[];
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function createOrLoadPr(input: PublishIterationInput): Promise<{ prUrl: string; prNumber: number }> {
  const pullsUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/pulls`;
  const create = await requestGitHub(
    pullsUrl,
    {
      method: "POST",
      body: JSON.stringify({
        title: input.prTitle,
        body: input.prBody,
        head: input.branch,
        base: input.baseBranch
      })
    },
    input.githubToken
  );
  const created = Array.isArray(create.body) ? null : create.body;
  if ((create.status === 201 || create.status === 200) && created?.html_url && created?.number) {
    return { prUrl: created.html_url, prNumber: created.number };
  }
  if (create.status !== 422) {
    throw new Error(`create pull request failed with status ${create.status}`);
  }

  const existing = await requestGitHub(
    `${pullsUrl}?state=open&head=${encodeURIComponent(`${input.owner}:${input.branch}`)}&base=${encodeURIComponent(input.baseBranch)}`,
    { method: "GET" },
    input.githubToken
  );
  if (existing.status === 200) {
    const body = existing.body;
    const list = Array.isArray(body) ? body : (body ? [body] : []);
    const first = list[0];
    if (first?.html_url && first?.number) {
      return { prUrl: first.html_url, prNumber: first.number };
    }
  }
  throw new Error("unable to create or load pull request");
}

export async function publishIterationBranch(input: PublishIterationInput): Promise<PublishIterationResult> {
  ensureGitRepo(input.repoPath);
  const local = performLocalCommit(input);

  if (input.dryRun) {
    const prUrl = input.openPr ? `https://github.com/${input.owner}/${input.repo}/pull/new/${input.branch}` : "";
    return {
      commit: local.commit,
      branch: input.branch,
      pushed: false,
      prUrl,
      prNumber: 0,
      dryRun: true
    };
  }

  if (!input.githubToken.trim()) {
    throw new Error("GITHUB_TOKEN is required when dryRun=false");
  }
  ensureRemote(input.repoPath, input.remoteName, input.cloneUrl);
  const push = runGit(["push", "-u", input.remoteName, input.branch], input.repoPath);
  if (push.status !== 0) {
    throw new Error(`git push failed: ${push.stderr || push.stdout}`);
  }

  let prUrl = "";
  let prNumber = 0;
  if (input.openPr) {
    const pr = await createOrLoadPr(input);
    prUrl = pr.prUrl;
    prNumber = pr.prNumber;
  }
  return {
    commit: local.commit,
    branch: input.branch,
    pushed: true,
    prUrl,
    prNumber,
    dryRun: false
  };
}

