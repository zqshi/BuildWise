"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectOp = createProjectOp;
exports.archiveProjectOp = archiveProjectOp;
exports.getProjectRepositoryOp = getProjectRepositoryOp;
exports.bootstrapProjectRepositoryOp = bootstrapProjectRepositoryOp;
exports.provisionProjectRepositoryOp = provisionProjectRepositoryOp;
exports.scaffoldProjectRepositoryOp = scaffoldProjectRepositoryOp;
exports.publishIterationToRemoteOp = publishIterationToRemoteOp;
const workspaceSupport_1 = require("./workspaceSupport");
const repositoryProvisioning_1 = require("./repositoryProvisioning");
const repositoryPublishing_1 = require("./repositoryPublishing");
const repositoryScaffolding_1 = require("./repositoryScaffolding");
const workspaceServiceCommon_1 = require("./workspaceServiceCommon");
function createProjectOp(repo, input) {
    const created = (0, workspaceSupport_1.normalizeProject)(repo.createProject(input));
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "project_repo_initialized", `project:${created.id}`, `repo=${created.repository?.url}`);
    return created;
}
function archiveProjectOp(repo, projectId) {
    const project = repo.findProject(projectId);
    if (!project) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeProject)(project);
    if (normalized.deletedAt) {
        return normalized;
    }
    const deletedAt = new Date().toISOString();
    const updated = {
        ...normalized,
        status: "archived",
        deletedAt,
        lastUpdated: deletedAt.slice(0, 10)
    };
    repo.updateProject(updated);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "project_soft_deleted", `project:${projectId}`, `deletedAt=${deletedAt}`);
    return updated;
}
function getProjectRepositoryOp(repo, projectId) {
    const project = repo.findProject(projectId);
    if (!project) {
        return null;
    }
    return (0, workspaceSupport_1.normalizeProject)(project).repository ?? null;
}
function bootstrapProjectRepositoryOp(repo, projectId, input) {
    const project = repo.findProject(projectId);
    if (!project) {
        return null;
    }
    const normalized = (0, workspaceSupport_1.normalizeProject)(project);
    const currentRepo = normalized.repository;
    if (!currentRepo) {
        return null;
    }
    const now = new Date().toISOString();
    const updatedRepo = {
        ...currentRepo,
        provider: input.provider ?? currentRepo.provider,
        organization: input.organization?.trim() || currentRepo.organization,
        name: input.name?.trim() || currentRepo.name,
        defaultBranch: input.defaultBranch?.trim() || currentRepo.defaultBranch,
        url: input.url?.trim() || currentRepo.url,
        updatedAt: now
    };
    const updatedProject = { ...normalized, repository: updatedRepo };
    repo.updateProject(updatedProject);
    (0, workspaceServiceCommon_1.writeAuditLog)(repo, "project_repo_updated", `project:${projectId}`, `repo=${updatedRepo.url}`);
    return updatedRepo;
}
async function provisionProjectRepositoryOp(repo, projectId, input) {
    const project = repo.findProject(projectId);
    if (!project) {
        return { ok: false, reason: "project_not_found" };
    }
    const normalized = (0, workspaceSupport_1.normalizeProject)(project);
    const projectRepo = normalized.repository;
    if (!projectRepo) {
        return { ok: false, reason: "repository_not_found" };
    }
    if (projectRepo.provider !== "github") {
        return { ok: false, reason: "provider_not_supported" };
    }
    const processEnv = globalThis.process?.env ?? {};
    const ownerType = input.ownerType ?? projectRepo.remote?.ownerType ?? "org";
    const organization = input.organization?.trim() || projectRepo.organization;
    const name = input.name?.trim() || projectRepo.name;
    const visibility = input.visibility ?? projectRepo.remote?.visibility ?? "private";
    const defaultBranch = input.defaultBranch?.trim() || projectRepo.defaultBranch;
    const dryRun = input.dryRun !== false;
    const githubToken = processEnv.GITHUB_TOKEN?.trim() || "";
    try {
        const provisioned = await (0, repositoryProvisioning_1.provisionGitHubRepository)({
            ownerType,
            organization,
            name,
            defaultBranch,
            visibility,
            autoInit: input.autoInit !== false,
            dryRun,
            githubToken
        });
        const now = new Date().toISOString();
        const remoteStatus = provisioned.dryRun ? "dry-run" : "provisioned";
        const updatedRepo = {
            ...projectRepo,
            organization,
            name,
            url: provisioned.htmlUrl,
            defaultBranch: provisioned.defaultBranch,
            updatedAt: now,
            remote: {
                status: remoteStatus,
                visibility: provisioned.visibility,
                ownerType: provisioned.ownerType,
                providerRepoId: provisioned.providerRepoId,
                htmlUrl: provisioned.htmlUrl,
                cloneUrl: provisioned.cloneUrl,
                sshUrl: provisioned.sshUrl,
                lastProvisionedAt: now
            }
        };
        repo.updateProject({ ...normalized, repository: updatedRepo });
        (0, workspaceServiceCommon_1.writeAuditLog)(repo, "project_repo_provisioned", `project:${projectId}`, `${updatedRepo.remote.status} ${provisioned.ownerType}/${organization}/${name}`);
        return { ok: true, data: updatedRepo };
    }
    catch (error) {
        return {
            ok: false,
            reason: "provision_failed",
            message: error instanceof Error ? error.message : "repository provision failed"
        };
    }
}
function scaffoldProjectRepositoryOp(repo, projectId, input) {
    const project = repo.findProject(projectId);
    if (!project) {
        return { ok: false, reason: "project_not_found" };
    }
    const normalized = (0, workspaceSupport_1.normalizeProject)(project);
    const projectRepo = normalized.repository;
    if (!projectRepo) {
        return { ok: false, reason: "repository_not_found" };
    }
    const processEnv = globalThis.process?.env ?? {};
    const rootDir = input.rootDir?.trim() || processEnv.PROJECT_REPO_ROOT?.trim() || "/tmp/buildwise-project-repos";
    try {
        const scaffolded = (0, repositoryScaffolding_1.scaffoldRepository)({
            rootDir,
            organization: projectRepo.organization,
            repositoryName: projectRepo.name,
            defaultBranch: projectRepo.defaultBranch,
            layout: projectRepo.layout,
            initializeGit: input.initializeGit !== false,
            createInitialCommit: input.createInitialCommit !== false,
            dryRun: input.dryRun === true
        });
        const now = new Date().toISOString();
        const updatedRepo = {
            ...projectRepo,
            updatedAt: now,
            workspace: {
                rootPath: rootDir,
                repoPath: scaffolded.repoPath,
                gitInitialized: scaffolded.gitInitialized,
                lastScaffoldedAt: now
            }
        };
        repo.updateProject({ ...normalized, repository: updatedRepo });
        (0, workspaceServiceCommon_1.writeAuditLog)(repo, "project_repo_scaffolded", `project:${projectId}`, `${scaffolded.repoPath} commit=${scaffolded.commit || "none"}`);
        return { ok: true, data: { repository: updatedRepo, scaffold: scaffolded } };
    }
    catch (error) {
        return {
            ok: false,
            reason: "scaffold_failed",
            message: error instanceof Error ? error.message : "repository scaffold failed"
        };
    }
}
async function publishIterationToRemoteOp(repo, iterationId, input) {
    const iteration = repo.findIteration(iterationId);
    if (!iteration) {
        return { ok: false, reason: "iteration_not_found" };
    }
    const project = repo.findProject(iteration.projectId);
    if (!project) {
        return { ok: false, reason: "project_not_found" };
    }
    const normalizedProject = (0, workspaceSupport_1.normalizeProject)(project);
    const projectRepo = normalizedProject.repository;
    if (!projectRepo) {
        return { ok: false, reason: "repository_not_found" };
    }
    if (!projectRepo.workspace?.repoPath) {
        return { ok: false, reason: "repository_not_scaffolded" };
    }
    const normalizedIteration = (0, workspaceSupport_1.normalizeIteration)(iteration);
    if (normalizedIteration.changeControl?.pendingHumanConfirmation) {
        return { ok: false, reason: "analysis_confirmation_required" };
    }
    if (normalizedIteration.changeControl?.lastReleaseReviewDecision === "block") {
        return {
            ok: false,
            reason: "release_review_blocked",
            message: normalizedIteration.changeControl.lastReleaseReviewReason || "release review blocked",
            blockers: normalizedIteration.changeControl.lastReleaseReviewBlockers || []
        };
    }
    const codeLink = normalizedIteration.codeLink ?? (0, workspaceServiceCommon_1.buildDefaultIterationCodeLink)(repo, normalizedIteration);
    if (!codeLink) {
        return { ok: false, reason: "code_link_unavailable" };
    }
    const processEnv = globalThis.process?.env ?? {};
    const dryRun = input.dryRun !== false;
    const githubToken = processEnv.GITHUB_TOKEN?.trim() || "";
    const commitMessage = input.commitMessage?.trim() || `feat(iteration): publish iteration ${normalizedIteration.id}`;
    const prTitle = input.prTitle?.trim() || `Iteration #${normalizedIteration.id}: ${normalizedIteration.name}`;
    const prBody = input.prBody?.trim() || `Auto-generated PR for iteration ${normalizedIteration.id}.`;
    const openPr = input.openPr !== false;
    try {
        const published = await (0, repositoryPublishing_1.publishIterationBranch)({
            repoPath: projectRepo.workspace.repoPath,
            branch: codeLink.branch,
            baseBranch: projectRepo.defaultBranch,
            commitMessage,
            remoteName: "origin",
            cloneUrl: projectRepo.remote?.cloneUrl || projectRepo.url,
            openPr,
            prTitle,
            prBody,
            owner: projectRepo.organization,
            repo: projectRepo.name,
            visibility: projectRepo.remote?.visibility || "private",
            ownerType: projectRepo.remote?.ownerType || "org",
            githubToken,
            dryRun
        });
        const updatedLink = {
            ...codeLink,
            commit: published.commit || codeLink.commit,
            pr: published.prUrl || codeLink.pr,
            linkedAt: new Date().toISOString()
        };
        normalizedIteration.codeLink = updatedLink;
        repo.updateIteration(normalizedIteration);
        (0, workspaceServiceCommon_1.writeAuditLog)(repo, "iteration_published", `iteration:${iterationId}`, `${updatedLink.branch}@${updatedLink.commit} pr=${updatedLink.pr || "none"}`);
        return {
            ok: true,
            data: {
                iterationId,
                projectId: normalizedIteration.projectId,
                codeLink: updatedLink,
                publish: published
            }
        };
    }
    catch (error) {
        return {
            ok: false,
            reason: "publish_failed",
            message: error instanceof Error ? error.message : "publish failed"
        };
    }
}
