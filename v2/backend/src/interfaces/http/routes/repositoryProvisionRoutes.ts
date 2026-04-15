import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerRepositoryProvisionRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/projects/:id/repository/provision", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          ownerType: { type: "string", enum: ["org", "user"] },
          organization: { type: "string" },
          name: { type: "string" },
          defaultBranch: { type: "string" },
          visibility: { type: "string", enum: ["private", "public"] },
          autoInit: { type: "boolean" },
          dryRun: { type: "boolean" }
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
      ownerType?: "org" | "user";
      organization?: string;
      name?: string;
      defaultBranch?: string;
      visibility?: "private" | "public";
      autoInit?: boolean;
      dryRun?: boolean;
    } | null;
    const result = await service.project.provisionProjectRepository(projectId, {
      ownerType: body?.ownerType,
      organization: body?.organization,
      name: body?.name,
      defaultBranch: body?.defaultBranch,
      visibility: body?.visibility,
      autoInit: body?.autoInit,
      dryRun: body?.dryRun
    });
    if (!result.ok) {
      if (result.reason === "project_not_found") {
        reply.code(404);
        return { message: "项目不存在" };
      }
      if (result.reason === "provider_not_supported") {
        reply.code(400);
        return { message: "不支持的代码仓库提供商" };
      }
      reply.code(502);
      return { message: result.message || "repository provision failed" };
    }
    return result.data;
  });

  app.post("/projects/:id/repository/scaffold", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          rootDir: { type: "string" },
          initializeGit: { type: "boolean" },
          createInitialCommit: { type: "boolean" },
          dryRun: { type: "boolean" }
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
      rootDir?: string;
      initializeGit?: boolean;
      createInitialCommit?: boolean;
      dryRun?: boolean;
    } | null;
    const result = service.project.scaffoldProjectRepository(projectId, {
      rootDir: body?.rootDir,
      initializeGit: body?.initializeGit,
      createInitialCommit: body?.createInitialCommit,
      dryRun: body?.dryRun
    });
    if (!result.ok) {
      if (result.reason === "project_not_found") {
        reply.code(404);
        return { message: "项目不存在" };
      }
      reply.code(500);
      return { message: "仓库初始化失败" };
    }
    return result.data;
  });
}
