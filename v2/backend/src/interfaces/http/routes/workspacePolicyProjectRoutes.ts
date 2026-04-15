import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentUserId, ensureProjectAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspacePolicyProjectRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/policies", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
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
    return {
      active: service.governance.getActiveProjectPolicy(projectId),
      items: service.governance.listProjectPolicies(projectId)
    };
  });

  app.post("/projects/:id/policies", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          strategy: { type: "object" }
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
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request);
    return service.governance.createProjectPolicyDraft(projectId, actor, body?.strategy);
  });

  app.post("/projects/:id/policies/:version/activate", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          version: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id", "version"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string; version: string };
    const projectId = parsePositiveInt(params.id);
    const version = parsePositiveInt(params.version);
    if (projectId === null || version === null) {
      reply.code(400);
      return { message: "无效的项目或版本" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const actor = currentUserId(request);
    const activated = service.governance.activateProjectPolicy(projectId, version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "策略版本不存在" };
    }
    return activated;
  });

  app.post("/projects/:id/policies/restore-initial", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
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
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const actor = currentUserId(request);
    const restored = service.governance.restoreProjectOrchestrationPolicyToInitialMode(projectId, actor);
    if (!restored) {
      reply.code(500);
      return { message: "项目编排策略恢复失败" };
    }
    return restored;
  });

  app.post("/projects/:id/workspace/bind", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          assistantProfile: { type: "string" },
          agentId: { type: "string" },
          workspacePath: { type: "string" },
          runtimeMode: { type: "string", enum: ["native", "bridge"] },
          locked: { type: "boolean" }
        },
        required: ["assistantProfile", "workspacePath"],
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
      assistantProfile?: string;
      agentId?: string;
      workspacePath?: string;
      runtimeMode?: "native" | "bridge";
      locked?: boolean;
    } | null;
    if (!body?.assistantProfile?.trim() || !body?.workspacePath?.trim()) {
      reply.code(400);
      return { message: "请提供助手配置和工作空间路径" };
    }
    const actor = currentUserId(request);
    try {
      return service.governance.upsertProjectWorkspaceBinding({
        projectId,
        assistantProfile: body.assistantProfile.trim(),
        agentId: body.agentId?.trim() || "main",
        workspacePath: body.workspacePath.trim(),
        runtimeMode: body.runtimeMode === "bridge" ? "bridge" : "native",
        locked: body.locked !== false,
        createdBy: actor
      });
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
  });

  app.get("/projects/:id/roles", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
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
    return service.governance.listTenantMemberBindings(access.tenantId);
  });

  app.post("/projects/:id/roles", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          userId: { type: "string" },
          role: { type: "string", enum: ["admin", "member", "viewer"] }
        },
        required: ["userId", "role"],
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
    const body = request.body as { userId?: string; role?: "admin" | "member" | "viewer" } | null;
    if (!body?.userId?.trim() || !body?.role) {
      reply.code(400);
      return { message: "请提供用户 ID 和角色" };
    }
    return service.governance.upsertTenantMemberBinding({
      tenantId: access.tenantId,
      userId: body.userId.trim(),
      role: body.role
    });
  });

  app.delete("/projects/:id/roles/:userId", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          userId: { type: "string", minLength: 1 }
        },
        required: ["id", "userId"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string; userId: string };
    const projectId = parsePositiveInt(params.id);
    const userId = (params.userId || "").trim();
    if (projectId === null || !userId) {
      reply.code(400);
      return { message: "无效的项目或用户" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const removed = service.governance.removeTenantMemberBinding(access.tenantId, userId);
    if (!removed) {
      reply.code(404);
      return { message: "角色绑定不存在" };
    }
    return { ok: true, projectId, userId };
  });
}
