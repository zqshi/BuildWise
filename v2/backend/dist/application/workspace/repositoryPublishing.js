"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishIterationBranch = publishIterationBranch;
const node_fs_1 = require("node:fs");
const node_child_process_1 = require("node:child_process");
const node_path_1 = require("node:path");
function runGit(args, cwd) {
    return (0, node_child_process_1.spawnSync)("git", args, { cwd, encoding: "utf-8" });
}
function ensureGitRepo(repoPath) {
    if (!(0, node_fs_1.existsSync)(repoPath)) {
        throw new Error(`repoPath does not exist: ${repoPath}`);
    }
    if (!(0, node_fs_1.existsSync)((0, node_path_1.join)(repoPath, ".git"))) {
        throw new Error(`repoPath is not a git repository: ${repoPath}`);
    }
}
function ensureRemote(repoPath, remoteName, cloneUrl) {
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
function performLocalCommit(input) {
    const checkout = runGit(["checkout", "-B", input.branch], input.repoPath);
    if (checkout.status !== 0) {
        throw new Error(`git checkout failed: ${checkout.stderr || checkout.stdout}`);
    }
    const add = runGit(["add", "-A"], input.repoPath);
    if (add.status !== 0) {
        throw new Error(`git add failed: ${add.stderr || add.stdout}`);
    }
    const commit = runGit([
        "-c",
        "user.name=BuildWise Bot",
        "-c",
        "user.email=buildwise@local",
        "commit",
        "--allow-empty",
        "-m",
        input.commitMessage
    ], input.repoPath);
    if (commit.status !== 0) {
        throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }
    const rev = runGit(["rev-parse", "HEAD"], input.repoPath);
    if (rev.status !== 0) {
        throw new Error(`git rev-parse failed: ${rev.stderr || rev.stdout}`);
    }
    return { commit: rev.stdout.trim() };
}
async function requestGitHub(url, init, token) {
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
    let body = null;
    try {
        body = (await res.json());
    }
    catch {
        body = null;
    }
    return { status: res.status, body };
}
async function createOrLoadPr(input) {
    const pullsUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/pulls`;
    const create = await requestGitHub(pullsUrl, {
        method: "POST",
        body: JSON.stringify({
            title: input.prTitle,
            body: input.prBody,
            head: input.branch,
            base: input.baseBranch
        })
    }, input.githubToken);
    if ((create.status === 201 || create.status === 200) && create.body?.html_url && create.body?.number) {
        return { prUrl: create.body.html_url, prNumber: create.body.number };
    }
    if (create.status !== 422) {
        throw new Error(`create pull request failed with status ${create.status}`);
    }
    const existing = await requestGitHub(`${pullsUrl}?state=open&head=${encodeURIComponent(`${input.owner}:${input.branch}`)}&base=${encodeURIComponent(input.baseBranch)}`, { method: "GET" }, input.githubToken);
    if (existing.status === 200) {
        const list = existing.body || [];
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.html_url && first?.number) {
            return { prUrl: first.html_url, prNumber: first.number };
        }
    }
    throw new Error("unable to create or load pull request");
}
async function publishIterationBranch(input) {
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
