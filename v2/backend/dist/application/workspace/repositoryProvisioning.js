"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.provisionGitHubRepository = provisionGitHubRepository;
function normalizeOrg(value) {
    return value.trim().replace(/^@/, "");
}
function dryRunRepo(input) {
    const org = normalizeOrg(input.organization) || "example-org";
    const repo = input.name.trim();
    return {
        providerRepoId: `dry-run:${org}/${repo}`,
        htmlUrl: `https://github.com/${org}/${repo}`,
        cloneUrl: `https://github.com/${org}/${repo}.git`,
        sshUrl: `git@github.com:${org}/${repo}.git`,
        defaultBranch: input.defaultBranch,
        visibility: input.visibility,
        ownerType: input.ownerType,
        dryRun: true
    };
}
async function requestGitHub(url, init, token, allow404 = false) {
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
    if (allow404 && res.status === 404) {
        return { status: 404, body: null };
    }
    let body = null;
    try {
        body = (await res.json());
    }
    catch {
        body = null;
    }
    return { status: res.status, body };
}
function toProvisionResult(body, input) {
    if (!body.html_url || !body.clone_url || !body.ssh_url) {
        return null;
    }
    const providerRepoId = typeof body.id === "number" ? String(body.id) : `${input.organization}/${input.name}`;
    return {
        providerRepoId,
        htmlUrl: body.html_url,
        cloneUrl: body.clone_url,
        sshUrl: body.ssh_url,
        defaultBranch: body.default_branch || input.defaultBranch,
        visibility: body.private === false ? "public" : "private",
        ownerType: input.ownerType,
        dryRun: false
    };
}
async function provisionGitHubRepository(input) {
    if (input.dryRun) {
        return dryRunRepo(input);
    }
    if (!input.githubToken.trim()) {
        throw new Error("GITHUB_TOKEN is required when dryRun=false");
    }
    const organization = normalizeOrg(input.organization);
    const payload = {
        name: input.name,
        private: input.visibility !== "public",
        auto_init: input.autoInit
    };
    const createUrl = input.ownerType === "org"
        ? `https://api.github.com/orgs/${organization}/repos`
        : "https://api.github.com/user/repos";
    const create = await requestGitHub(createUrl, { method: "POST", body: JSON.stringify(payload) }, input.githubToken);
    if (create.status === 201 && create.body) {
        const created = toProvisionResult(create.body, input);
        if (created) {
            return created;
        }
    }
    if (create.status !== 422 && create.status !== 201) {
        throw new Error(`GitHub repository create failed with status ${create.status}`);
    }
    const getUrl = `https://api.github.com/repos/${organization}/${input.name}`;
    const existing = await requestGitHub(getUrl, { method: "GET" }, input.githubToken, true);
    if (existing.status === 200 && existing.body) {
        const result = toProvisionResult(existing.body, input);
        if (result) {
            return result;
        }
    }
    throw new Error("Unable to create or load repository from GitHub");
}
