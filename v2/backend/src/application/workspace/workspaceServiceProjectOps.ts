import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Project } from "../../domain/workspace/types";
import { normalizeProject } from "./workspaceSupport";
import { writeAuditLog } from "./workspaceServiceCommon";
import { collectRepositoryHealth } from "./workspaceServiceProjectRepoHealthOps";

export { provisionProjectRepositoryOp, scaffoldProjectRepositoryOp } from "./workspaceServiceProjectProvisionOps";
export { publishIterationToRemoteOp } from "./workspaceServiceProjectPublishOps";

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
