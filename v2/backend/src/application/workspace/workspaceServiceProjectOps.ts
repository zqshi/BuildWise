import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, Project } from "../../domain/workspace/types";
import { normalizeIteration, normalizeProject } from "./workspaceSupport";
import { provisionGitHubRepository } from "./repositoryProvisioning";
import { publishIterationBranch } from "./repositoryPublishing";
import { scaffoldRepository } from "./repositoryScaffolding";
import { buildDefaultIterationCodeLink, writeAuditLog } from "./workspaceServiceCommon";
import { assertBoundaryWhitelist, listWorkingTreeChangedPaths } from "./boundaryGuard";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function runGit(args: string[], cwd: string) {
  return spawnSync("git", args, { cwd, encoding: "utf-8" });
}

function inferRemoteConfigured(projectRepo: NonNullable<Project["repository"]>) {
  if (projectRepo.remote?.status === "provisioned") {
    return true;
  }
  if (!projectRepo.url) {
    return false;
  }
  return /^(https?:\/\/|git@|ssh:\/\/)/i.test(projectRepo.url.trim());
}

function collectRepositoryHealth(projectRepo: NonNullable<Project["repository"]>) {
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
    lastError: remoteReachable ? "" : fetchDry.stderr?.trim() || fetchDry.stdout?.trim() || "origin is unreachable"
  };
}

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
  input: Partial<
    Pick<NonNullable<Project["repository"]>, "provider" | "organization" | "name" | "url" | "defaultBranch" | "repoMode"> & {
      requireRemoteForProduction: boolean;
      requireRemoteForStaging: boolean;
    }
  >
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
    repoMode: input.repoMode ?? currentRepo.repoMode,
    provider: input.provider ?? currentRepo.provider,
    organization: input.organization?.trim() || currentRepo.organization,
    name: input.name?.trim() || currentRepo.name,
    defaultBranch: input.defaultBranch?.trim() || currentRepo.defaultBranch,
    url: input.url?.trim() || currentRepo.url,
    governance: {
      requireRemoteForProduction:
        typeof input.requireRemoteForProduction === "boolean"
          ? input.requireRemoteForProduction
          : currentRepo.governance?.requireRemoteForProduction ?? true,
      requireRemoteForStaging:
        typeof input.requireRemoteForStaging === "boolean"
          ? input.requireRemoteForStaging
          : currentRepo.governance?.requireRemoteForStaging ?? false
    },
    health: collectRepositoryHealth({
      ...currentRepo,
      provider: input.provider ?? currentRepo.provider,
      organization: input.organization?.trim() || currentRepo.organization,
      name: input.name?.trim() || currentRepo.name,
      url: input.url?.trim() || currentRepo.url,
      defaultBranch: input.defaultBranch?.trim() || currentRepo.defaultBranch,
      repoMode: input.repoMode ?? currentRepo.repoMode
    }),
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
      repoMode: projectRepo.repoMode === "managed_local" ? "hybrid" : projectRepo.repoMode,
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
      },
      health: {
        ...collectRepositoryHealth({
          ...projectRepo,
          repoMode: projectRepo.repoMode === "managed_local" ? "hybrid" : projectRepo.repoMode,
          organization,
          name,
          url: provisioned.htmlUrl,
          defaultBranch: provisioned.defaultBranch,
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
        }),
        remoteConfigured: true,
        remoteReachable: true
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
      repoMode: projectRepo.repoMode === "external_git" ? "hybrid" : projectRepo.repoMode,
      updatedAt: now,
      workspace: {
        rootPath: rootDir,
        repoPath: scaffolded.repoPath,
        gitInitialized: scaffolded.gitInitialized,
        lastScaffoldedAt: now
      },
      health: collectRepositoryHealth({
        ...projectRepo,
        repoMode: projectRepo.repoMode === "external_git" ? "hybrid" : projectRepo.repoMode,
        workspace: {
          rootPath: rootDir,
          repoPath: scaffolded.repoPath,
          gitInitialized: scaffolded.gitInitialized,
          lastScaffoldedAt: now
        }
      })
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

export function configureProjectRepositoryModeOp(
  repo: WorkspaceRepository,
  projectId: number,
  input: {
    repoMode?: "external_git" | "managed_local" | "hybrid";
    requireRemoteForProduction?: boolean;
    requireRemoteForStaging?: boolean;
  }
) {
  const project = repo.findProject(projectId);
  if (!project) {
    return null;
  }
  const normalized = normalizeProject(project);
  const projectRepo = normalized.repository;
  if (!projectRepo) {
    return null;
  }
  const now = new Date().toISOString();
  const updatedRepo = {
    ...projectRepo,
    repoMode: input.repoMode ?? projectRepo.repoMode,
    governance: {
      requireRemoteForProduction:
        typeof input.requireRemoteForProduction === "boolean"
          ? input.requireRemoteForProduction
          : projectRepo.governance?.requireRemoteForProduction ?? true,
      requireRemoteForStaging:
        typeof input.requireRemoteForStaging === "boolean"
          ? input.requireRemoteForStaging
          : projectRepo.governance?.requireRemoteForStaging ?? false
    },
    health: collectRepositoryHealth(projectRepo),
    updatedAt: now
  };
  repo.updateProject({ ...normalized, repository: updatedRepo });
  writeAuditLog(
    repo,
    "project_repo_mode_configured",
    `project:${projectId}`,
    `mode=${updatedRepo.repoMode};prodRemote=${updatedRepo.governance.requireRemoteForProduction ? "yes" : "no"};stagingRemote=${
      updatedRepo.governance.requireRemoteForStaging ? "yes" : "no"
    }`
  );
  return updatedRepo;
}

export function getProjectRepositoryStatusOp(repo: WorkspaceRepository, projectId: number) {
  const project = repo.findProject(projectId);
  if (!project) {
    return null;
  }
  const normalized = normalizeProject(project);
  const projectRepo = normalized.repository;
  if (!projectRepo) {
    return null;
  }
  const health = collectRepositoryHealth(projectRepo);
  const updatedRepo = {
    ...projectRepo,
    health,
    updatedAt: new Date().toISOString()
  };
  repo.updateProject({ ...normalized, repository: updatedRepo });
  return {
    projectId,
    repoMode: updatedRepo.repoMode,
    governance: updatedRepo.governance,
    remote: updatedRepo.remote,
    workspace: updatedRepo.workspace,
    health
  };
}

export function getProjectRepositoryMigrationPlanOp(repo: WorkspaceRepository, projectId: number) {
  const status = getProjectRepositoryStatusOp(repo, projectId);
  if (!status) {
    return null;
  }
  const mode = status.repoMode;
  const steps: Array<{
    id: string;
    title: string;
    description: string;
    status: "pending" | "ready" | "done" | "blocked";
    action: string;
  }> = [];
  const remoteConfigured = Boolean(status.health?.remoteConfigured);
  const remoteReachable = Boolean(status.health?.remoteReachable);
  const remoteSynced = Boolean(status.health?.remoteSynced);

  steps.push({
    id: "step-local-repo",
    title: "本地仓库可用性",
    description: "确认 workspace 本地仓库已初始化并可进行提交。",
    status: status.workspace?.gitInitialized ? "done" : "pending",
    action: status.workspace?.gitInitialized ? "已就绪" : "执行 repository/scaffold 初始化本地仓库"
  });

  steps.push({
    id: "step-remote-bind",
    title: "远端仓库绑定",
    description: "为项目绑定远端 Git 仓库（provision 或 bootstrap URL）。",
    status: remoteConfigured ? "done" : mode === "managed_local" ? "ready" : "pending",
    action: remoteConfigured ? "已绑定" : "执行 repository/provision 或 repository/bootstrap 配置 URL"
  });

  steps.push({
    id: "step-remote-check",
    title: "远端可达性检查",
    description: "验证 origin 是否可达且具备读权限。",
    status: !remoteConfigured ? "blocked" : remoteReachable ? "done" : "pending",
    action: !remoteConfigured ? "先完成远端绑定" : remoteReachable ? "已可达" : "检查网络、权限和 token"
  });

  steps.push({
    id: "step-sync-check",
    title: "远端同步状态",
    description: "确认本地与远端分支无 ahead/behind 差异。",
    status: !remoteConfigured || !remoteReachable ? "blocked" : remoteSynced ? "done" : "pending",
    action: !remoteConfigured || !remoteReachable ? "先完成远端绑定与可达性" : remoteSynced ? "已同步" : "执行 pull/push 同步分支"
  });

  steps.push({
    id: "step-mode-upgrade",
    title: "模式切换到生产策略",
    description: "将仓库模式切换到 hybrid/external_git，并启用生产远端门禁。",
    status:
      (mode === "hybrid" || mode === "external_git") && status.governance?.requireRemoteForProduction
        ? "done"
        : remoteConfigured
          ? "ready"
          : "blocked",
    action:
      (mode === "hybrid" || mode === "external_git") && status.governance?.requireRemoteForProduction
        ? "已满足生产策略"
        : "调用 repository/mode 设置 repoMode=hybrid 或 external_git，requireRemoteForProduction=true"
  });

  const blockers = steps.filter((item) => item.status === "blocked").map((item) => `${item.title}: ${item.action}`);
  const nextAction =
    steps.find((item) => item.status === "ready" || item.status === "pending")?.action || "迁移完成，可进入生产发布流程。";
  const targetMode: "hybrid" | "external_git" = remoteConfigured ? "external_git" : "hybrid";
  return {
    projectId,
    currentMode: mode,
    targetMode,
    blockers,
    nextAction,
    steps
  };
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
  const matrix = Array.isArray(normalizedIteration.changeControl?.generatedTestMatrix)
    ? normalizedIteration.changeControl!.generatedTestMatrix
    : [];
  const failedOrBlocked = matrix.filter((item) => item.executionStatus === "failed" || item.executionStatus === "blocked");
  if (failedOrBlocked.length > 0) {
    return {
      ok: false as const,
      reason: "release_review_blocked",
      message: `test matrix has ${failedOrBlocked.length} failed/blocked cases`,
      blockers: failedOrBlocked.map((item) => item.caseId)
    };
  }
  const acceptanceChecklist = Array.isArray(normalizedIteration.changeControl?.qualityArtifacts?.acceptanceChecklist)
    ? normalizedIteration.changeControl!.qualityArtifacts.acceptanceChecklist
    : [];
  if (acceptanceChecklist.length === 0) {
    return {
      ok: false as const,
      reason: "release_review_blocked",
      message: "acceptance checklist is missing",
      blockers: ["缺少 acceptanceChecklist，无法进入发布"]
    };
  }
  const codeLink = normalizedIteration.codeLink ?? buildDefaultIterationCodeLink(repo, normalizedIteration);
  if (!codeLink) {
    return { ok: false as const, reason: "code_link_unavailable" };
  }
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const dryRun = input.dryRun !== false;
  const repoMode = projectRepo.repoMode || "hybrid";
  const remoteConfigured = inferRemoteConfigured(projectRepo);
  if (!dryRun && repoMode === "managed_local") {
    return {
      ok: false as const,
      reason: "remote_required_for_publish",
      message: "managed_local mode requires remote binding before non-dry-run publish"
    };
  }
  if (!dryRun && !remoteConfigured) {
    return {
      ok: false as const,
      reason: "remote_required_for_publish",
      message: "remote repository is not configured"
    };
  }
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
