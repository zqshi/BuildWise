import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerRepositoryConfigRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/repository", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const repo = service.project.getProjectRepository(projectId);
    if (!repo) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return repo;
  });

  app.post("/projects/:id/repository/bootstrap", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["github", "gitlab", "gitea", "bitbucket", "custom"] },
          organization: { type: "string" },
          name: { type: "string" },
          url: { type: "string" },
          defaultBranch: { type: "string" },
          repoMode: { type: "string", enum: ["external_git", "managed_local", "hybrid"] },
          requireRemoteForProduction: { type: "boolean" },
          requireRemoteForStaging: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const body = request.body as {
      provider?: "github" | "gitlab" | "gitea" | "bitbucket" | "custom";
      organization?: string;
      name?: string;
      url?: string;
      defaultBranch?: string;
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    } | null;
    const repo = service.project.bootstrapProjectRepository(projectId, {
      provider: body?.provider,
      organization: body?.organization,
      name: body?.name,
      url: body?.url,
      defaultBranch: body?.defaultBranch,
      repoMode: body?.repoMode,
      requireRemoteForProduction: body?.requireRemoteForProduction,
      requireRemoteForStaging: body?.requireRemoteForStaging
    });
    if (!repo.ok) {
      if (repo.reason === "project_not_found" || repo.reason === "repository_not_found") {
        reply.code(404);
        return { message: "项目不存在" };
      }
      if (repo.reason === "remote_validation_failed") {
        reply.code(400);
        return { message: repo.message || "repository remote validation failed" };
      }
      reply.code(400);
      return { message: "仓库引导失败" };
    }
    return repo.data;
  });

  app.post("/projects/:id/repository/validate", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          url: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const body = request.body as { url?: string } | null;
    const result = service.project.validateProjectRepositoryRemote(projectId, { url: body?.url });
    if (!result.ok) {
      if (result.reason === "project_not_found" || result.reason === "repository_not_found") {
        reply.code(404);
        return { message: "项目不存在" };
      }
      if (result.reason === "remote_validation_failed") {
        reply.code(400);
        return { message: result.message || "仓库远程地址校验失败", checkedAt: result.checkedAt || "" };
      }
      reply.code(400);
      return { message: "仓库远程地址校验失败" };
    }
    return result.data;
  });

  app.get("/projects/:id/repository/status", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const status = service.project.getProjectRepositoryStatus(projectId);
    if (!status) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return status;
  });

  app.get("/projects/:id/repository/migration-plan", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const plan = service.project.getProjectRepositoryMigrationPlan(projectId);
    if (!plan) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return plan;
  });

  app.post("/projects/:id/repository/mode", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          repoMode: { type: "string", enum: ["external_git", "managed_local", "hybrid"] },
          requireRemoteForProduction: { type: "boolean" },
          requireRemoteForStaging: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const body = request.body as {
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    } | null;
    const configured = service.project.configureProjectRepositoryMode(projectId, {
      repoMode: body?.repoMode,
      requireRemoteForProduction: body?.requireRemoteForProduction,
      requireRemoteForStaging: body?.requireRemoteForStaging
    });
    if (!configured) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return configured;
  });
}
