import type { WorkspaceRepository } from "../../domain/workspace/repository";
import {
  archiveProjectOp,
  bootstrapProjectRepositoryOp,
  configureProjectRepositoryModeOp,
  createProjectOp,
  getProjectRepositoryStatusOp,
  getProjectRepositoryOp,
  getProjectRepositoryMigrationPlanOp,
  validateProjectRepositoryRemoteOp,
  provisionProjectRepositoryOp,
  publishIterationToRemoteOp,
  scaffoldProjectRepositoryOp
} from "./workspaceServiceProjectOps";
import { hasProject, listProjectsNormalized } from "./workspaceServiceCommon";
import { getProjectAccessContext, getTenantAccessContext, listAccessibleTenants, listProjectsForUser } from "./workspaceTenantAccess";

export class ProjectService {
  private readonly repo: WorkspaceRepository;
  constructor(repo: WorkspaceRepository) {
    this.repo = repo;
  }

  hasProject(projectId: number) {
    return hasProject(this.repo, projectId);
  }

  listProjects() {
    return listProjectsNormalized(this.repo);
  }

  listProjectsForUser(userId: string, tenantId?: string) {
    return listProjectsForUser(this.repo, userId, tenantId);
  }

  createProject(input: { name: string; description: string; tenantId: string; ownerUserId: string }) {
    return createProjectOp(this.repo, input);
  }

  getProjectAccess(userId: string, projectId: number) {
    return getProjectAccessContext(this.repo, projectId, userId);
  }

  getTenantAccess(userId: string, tenantId: string) {
    return getTenantAccessContext(this.repo, userId, tenantId);
  }

  listAccessibleTenants(userId: string) {
    return listAccessibleTenants(this.repo, userId);
  }

  archiveProject(projectId: number) {
    return archiveProjectOp(this.repo, projectId);
  }

  getProjectRepository(projectId: number) {
    return getProjectRepositoryOp(this.repo, projectId);
  }

  bootstrapProjectRepository(
    projectId: number,
    input: Partial<
      Pick<NonNullable<ReturnType<typeof this.getProjectRepository>>, "provider" | "organization" | "name" | "url" | "defaultBranch" | "repoMode"> & {
        requireRemoteForProduction: boolean;
        requireRemoteForStaging: boolean;
      }
    >
  ) {
    return bootstrapProjectRepositoryOp(this.repo, projectId, input);
  }

  validateProjectRepositoryRemote(projectId: number, input: { url?: string }) {
    return validateProjectRepositoryRemoteOp(this.repo, projectId, input);
  }

  configureProjectRepositoryMode(
    projectId: number,
    input: {
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    }
  ) {
    return configureProjectRepositoryModeOp(this.repo, projectId, input);
  }

  getProjectRepositoryStatus(projectId: number) {
    return getProjectRepositoryStatusOp(this.repo, projectId);
  }

  getProjectRepositoryMigrationPlan(projectId: number) {
    return getProjectRepositoryMigrationPlanOp(this.repo, projectId);
  }

  provisionProjectRepository(
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
    return provisionProjectRepositoryOp(this.repo, projectId, input);
  }

  scaffoldProjectRepository(
    projectId: number,
    input: {
      rootDir?: string;
      initializeGit?: boolean;
      createInitialCommit?: boolean;
      dryRun?: boolean;
    }
  ) {
    return scaffoldProjectRepositoryOp(this.repo, projectId, input);
  }

  publishIterationToRemote(
    iterationId: number,
    input: {
      commitMessage?: string;
      openPr?: boolean;
      prTitle?: string;
      prBody?: string;
      dryRun?: boolean;
    }
  ) {
    return publishIterationToRemoteOp(this.repo, iterationId, input);
  }
}
