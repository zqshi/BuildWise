import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, Project } from "../../domain/workspace/types";
import { normalizeIteration, normalizeProject } from "./workspaceSupport";
import { provisionGitHubRepository } from "./repositoryProvisioning";
import { publishIterationBranch } from "./repositoryPublishing";
import { scaffoldRepository } from "./repositoryScaffolding";
import { buildDefaultIterationCodeLink, writeAuditLog } from "./workspaceServiceCommon";
import { assertBoundaryWhitelist, listWorkingTreeChangedPaths } from "./boundaryGuard";

export function createProjectOp(repo: WorkspaceRepository, input: { name: string; description: string }) {
  const created = normalizeProject(repo.createProject(input));
  writeAuditLog(repo, "project_repo_initialized", `project:${created.id}`, `repo=${created.repository?.url}`);
  return created;
}

export function archiveProjectOp(repo: WorkspaceRepository, projectId: number) {
  const project = repo.findProject(projectId);
  if (!project) {
    return null;
  }
  const normalized = normalizeProject(project);
  if (normalized.deletedAt) {
    return normalized;
  }
  const deletedAt = new Date().toISOString();
  const updated: Project = {
    ...normalized,
    status: "archived",
    deletedAt,
    lastUpdated: deletedAt.slice(0, 10)
  };
  repo.updateProject(updated);
  writeAuditLog(repo, "project_soft_deleted", `project:${projectId}`, `deletedAt=${deletedAt}`);
  return updated;
}

export function getProjectRepositoryOp(repo: WorkspaceRepository, projectId: number) {
  const project = repo.findProject(projectId);
  if (!project) {
    return null;
  }
  return normalizeProject(project).repository ?? null;
}

export function bootstrapProjectRepositoryOp(
  repo: WorkspaceRepository,
  projectId: number,
  input: Partial<Pick<NonNullable<Project["repository"]>, "provider" | "organization" | "name" | "url" | "defaultBranch">>
) {
  const project = repo.findProject(projectId);
  if (!project) {
    return null;
  }
  const normalized = normalizeProject(project);
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
  writeAuditLog(repo, "project_repo_updated", `project:${projectId}`, `repo=${updatedRepo.url}`);
  return updatedRepo;
}

export async function provisionProjectRepositoryOp(
  repo: WorkspaceRepository,
  projectId: number,
  input: {
    ownerType?: "org" | "user";
    organization?: string;
    name?: string;
    defaultBranch?: string;
    visibility?: "private" | "public";
    autoInit?: boolean;
    dryRun?: boolean;
  }
) {
  const project = repo.findProject(projectId);
  if (!project) {
    return { ok: false as const, reason: "project_not_found" };
  }
  const normalized = normalizeProject(project);
  const projectRepo = normalized.repository;
  if (!projectRepo) {
    return { ok: false as const, reason: "repository_not_found" };
  }
  if (projectRepo.provider !== "github") {
    return { ok: false as const, reason: "provider_not_supported" };
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const ownerType = input.ownerType ?? projectRepo.remote?.ownerType ?? "org";
  const organization = input.organization?.trim() || projectRepo.organization;
  const name = input.name?.trim() || projectRepo.name;
  const visibility = input.visibility ?? projectRepo.remote?.visibility ?? "private";
  const defaultBranch = input.defaultBranch?.trim() || projectRepo.defaultBranch;
  const dryRun = input.dryRun !== false;
  const githubToken = processEnv.GITHUB_TOKEN?.trim() || "";
  try {
    const provisioned = await provisionGitHubRepository({
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
    const remoteStatus: "provisioned" | "dry-run" = provisioned.dryRun ? "dry-run" : "provisioned";
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
    writeAuditLog(
      repo,
      "project_repo_provisioned",
      `project:${projectId}`,
      `${updatedRepo.remote.status} ${provisioned.ownerType}/${organization}/${name}`
    );
    return { ok: true as const, data: updatedRepo };
  } catch (error) {
    return {
      ok: false as const,
      reason: "provision_failed",
      message: error instanceof Error ? error.message : "repository provision failed"
    };
  }
}

export function scaffoldProjectRepositoryOp(
  repo: WorkspaceRepository,
  projectId: number,
  input: {
    rootDir?: string;
    initializeGit?: boolean;
    createInitialCommit?: boolean;
    dryRun?: boolean;
  }
) {
  const project = repo.findProject(projectId);
  if (!project) {
    return { ok: false as const, reason: "project_not_found" };
  }
  const normalized = normalizeProject(project);
  const projectRepo = normalized.repository;
  if (!projectRepo) {
    return { ok: false as const, reason: "repository_not_found" };
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const rootDir = input.rootDir?.trim() || processEnv.PROJECT_REPO_ROOT?.trim() || "/tmp/buildwise-project-repos";
  try {
    const scaffolded = scaffoldRepository({
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
    writeAuditLog(repo, "project_repo_scaffolded", `project:${projectId}`, `${scaffolded.repoPath} commit=${scaffolded.commit || "none"}`);
    return { ok: true as const, data: { repository: updatedRepo, scaffold: scaffolded } };
  } catch (error) {
    return {
      ok: false as const,
      reason: "scaffold_failed",
      message: error instanceof Error ? error.message : "repository scaffold failed"
    };
  }
}

export async function publishIterationToRemoteOp(
  repo: WorkspaceRepository,
  iterationId: number,
  input: { commitMessage?: string; openPr?: boolean; prTitle?: string; prBody?: string; dryRun?: boolean }
) {
  const iteration = repo.findIteration(iterationId);
  if (!iteration) {
    return { ok: false as const, reason: "iteration_not_found" };
  }
  const project = repo.findProject(iteration.projectId);
  if (!project) {
    return { ok: false as const, reason: "project_not_found" };
  }
  const normalizedProject = normalizeProject(project);
  const projectRepo = normalizedProject.repository;
  if (!projectRepo) {
    return { ok: false as const, reason: "repository_not_found" };
  }
  if (!projectRepo.workspace?.repoPath) {
    return { ok: false as const, reason: "repository_not_scaffolded" };
  }
  const normalizedIteration = normalizeIteration(iteration);
  if (normalizedIteration.changeControl?.pendingHumanConfirmation) {
    return { ok: false as const, reason: "analysis_confirmation_required" };
  }
  if (normalizedIteration.changeControl?.lastReleaseReviewDecision === "block") {
    return {
      ok: false as const,
      reason: "release_review_blocked",
      message: normalizedIteration.changeControl.lastReleaseReviewReason || "release review blocked",
      blockers: normalizedIteration.changeControl.lastReleaseReviewBlockers || []
    };
  }
  const codeLink = normalizedIteration.codeLink ?? buildDefaultIterationCodeLink(repo, normalizedIteration);
  if (!codeLink) {
    return { ok: false as const, reason: "code_link_unavailable" };
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const dryRun = input.dryRun !== false;
  const githubToken = processEnv.GITHUB_TOKEN?.trim() || "";
  const commitMessage = input.commitMessage?.trim() || `feat(iteration): publish iteration ${normalizedIteration.id}`;
  const prTitle = input.prTitle?.trim() || `Iteration #${normalizedIteration.id}: ${normalizedIteration.name}`;
  const prBody = input.prBody?.trim() || `Auto-generated PR for iteration ${normalizedIteration.id}.`;
  const openPr = input.openPr !== false;
  const boundaryCodePaths = normalizedIteration.changeControl?.boundary?.codePaths ?? [];
  try {
    const changedPaths = listWorkingTreeChangedPaths(projectRepo.workspace.repoPath);
    const boundaryCheck = assertBoundaryWhitelist({
      repoPath: projectRepo.workspace.repoPath,
      whitelist: boundaryCodePaths,
      changedPaths
    });
    if (!boundaryCheck.ok) {
      return {
        ok: false as const,
        reason: "boundary_violation",
        message: "changed files exceed boundary whitelist",
        blockers: boundaryCheck.violations
      };
    }
    const published = await publishIterationBranch({
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
    writeAuditLog(repo, "iteration_published", `iteration:${iterationId}`, `${updatedLink.branch}@${updatedLink.commit} pr=${updatedLink.pr || "none"}`);
    return {
      ok: true as const,
      data: {
        iterationId,
        projectId: normalizedIteration.projectId,
        codeLink: updatedLink,
        publish: published
      }
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: "publish_failed",
      message: error instanceof Error ? error.message : "publish failed"
    };
  }
}
