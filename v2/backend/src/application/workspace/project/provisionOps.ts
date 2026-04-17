import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { Project } from '../../../domain/workspace/types';
import { normalizeProject } from '../shared/workspaceSupport';
import { provisionGitHubRepository } from "./repositoryProvisioning";
import { scaffoldRepository } from "./repositoryScaffolding";
import { writeAuditLog } from '../shared/common';
import { collectRepositoryHealth } from './repoHealthOps';

function resolveProjectRepo(repo: WorkspaceRepository, projectId: number) {
  const project = repo.findProject(projectId);
  if (!project) return { ok: false as const, reason: "project_not_found" as const };
  const normalized = normalizeProject(project);
  const projectRepo = normalized.repository;
  if (!projectRepo) return { ok: false as const, reason: "repository_not_found" as const };
  return { ok: true as const, normalized, projectRepo };
}

function buildProvisionedRepo(
  projectRepo: NonNullable<Project["repository"]>,
  provisioned: { dryRun: boolean; visibility: "private" | "public"; ownerType: "org" | "user"; providerRepoId: string; htmlUrl: string; cloneUrl: string; sshUrl: string; defaultBranch: string },
  organization: string, name: string, now: string
) {
  const remoteStatus: "provisioned" | "dry-run" = provisioned.dryRun ? "dry-run" : "provisioned";
  const remote = {
    status: remoteStatus, visibility: provisioned.visibility, ownerType: provisioned.ownerType,
    providerRepoId: provisioned.providerRepoId, htmlUrl: provisioned.htmlUrl, cloneUrl: provisioned.cloneUrl, sshUrl: provisioned.sshUrl, lastProvisionedAt: now,
  };
  const baseOverrides = { repoMode: projectRepo.repoMode === "managed_local" ? "hybrid" : projectRepo.repoMode, organization, name, url: provisioned.htmlUrl, defaultBranch: provisioned.defaultBranch };
  return {
    ...projectRepo, ...baseOverrides, updatedAt: now, remote,
    health: { ...collectRepositoryHealth({ ...projectRepo, ...baseOverrides, remote }), remoteConfigured: true, remoteReachable: true },
  };
}

export async function provisionProjectRepositoryOp(
  repo: WorkspaceRepository, projectId: number,
  input: { ownerType?: "org" | "user"; organization?: string; name?: string; defaultBranch?: string; visibility?: "private" | "public"; autoInit?: boolean; dryRun?: boolean }
) {
  const resolved = resolveProjectRepo(repo, projectId);
  if (!resolved.ok) return resolved;
  const { normalized, projectRepo } = resolved;
  if (projectRepo.provider !== "github") return { ok: false as const, reason: "provider_not_supported" };

  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const organization = input.organization?.trim() || projectRepo.organization;
  const name = input.name?.trim() || projectRepo.name;
  try {
    const provisioned = await provisionGitHubRepository({
      ownerType: input.ownerType ?? projectRepo.remote?.ownerType ?? "org", organization, name,
      defaultBranch: input.defaultBranch?.trim() || projectRepo.defaultBranch,
      visibility: input.visibility ?? projectRepo.remote?.visibility ?? "private",
      autoInit: input.autoInit !== false, dryRun: input.dryRun === true, githubToken: processEnv.GITHUB_TOKEN?.trim() || "",
    });
    const updatedRepo = buildProvisionedRepo(projectRepo, provisioned, organization, name, new Date().toISOString());
    repo.updateProject({ ...normalized, repository: updatedRepo });
    writeAuditLog(repo, "project_repo_provisioned", `project:${projectId}`, `${updatedRepo.remote.status} ${provisioned.ownerType}/${organization}/${name}`);
    return { ok: true as const, data: updatedRepo };
  } catch (error) {
    return { ok: false as const, reason: "provision_failed", message: error instanceof Error ? error.message : "仓库创建失败" };
  }
}

export function scaffoldProjectRepositoryOp(
  repo: WorkspaceRepository, projectId: number,
  input: { rootDir?: string; initializeGit?: boolean; createInitialCommit?: boolean; dryRun?: boolean }
) {
  const resolved = resolveProjectRepo(repo, projectId);
  if (!resolved.ok) return resolved;
  const { normalized, projectRepo } = resolved;

  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const rootDir = input.rootDir?.trim() || processEnv.PROJECT_REPO_ROOT?.trim() || "/tmp/buildwise-project-repos";
  try {
    const scaffolded = scaffoldRepository({
      rootDir, organization: projectRepo.organization, repositoryName: projectRepo.name,
      defaultBranch: projectRepo.defaultBranch, layout: projectRepo.layout,
      initializeGit: input.initializeGit !== false, createInitialCommit: input.createInitialCommit !== false, dryRun: input.dryRun === true,
    });
    const now = new Date().toISOString();
    const workspace = { rootPath: rootDir, repoPath: scaffolded.repoPath, gitInitialized: scaffolded.gitInitialized, lastScaffoldedAt: now };
    const updatedRepo = {
      ...projectRepo, repoMode: projectRepo.repoMode === "external_git" ? "hybrid" : projectRepo.repoMode,
      updatedAt: now, workspace, health: collectRepositoryHealth({ ...projectRepo, repoMode: projectRepo.repoMode === "external_git" ? "hybrid" : projectRepo.repoMode, workspace }),
    };
    repo.updateProject({ ...normalized, repository: updatedRepo });
    writeAuditLog(repo, "project_repo_scaffolded", `project:${projectId}`, `${scaffolded.repoPath} commit=${scaffolded.commit || "none"}`);
    return { ok: true as const, data: { repository: updatedRepo, scaffold: scaffolded } };
  } catch (error) {
    return { ok: false as const, reason: "scaffold_failed", message: error instanceof Error ? error.message : "仓库脚手架初始化失败" };
  }
}
