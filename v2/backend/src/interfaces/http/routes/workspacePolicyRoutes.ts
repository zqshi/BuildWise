import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { currentRole, currentUserId, ensureProjectAccess, handleRouteError, isAdmin, parsePositiveInt } from "./workspaceRouteUtils";
import { registerWorkspacePolicyExecutionRoutes } from "./workspacePolicyExecutionRoutes";

export function registerWorkspacePolicyRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/governance/orchestration/policies", async () => {
    return {
      active: service.getActiveGlobalOrchestrationPolicy(),
      items: service.listGlobalOrchestrationPolicies()
    };
  });

  app.post("/governance/orchestration/policies", {
    schema: {
      body: {
        type: "object",
        properties: {
          strategy: { type: "object" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request);
    return service.createGlobalOrchestrationPolicyDraft(actor, body?.strategy);
  });

  app.post("/governance/orchestration/policies/:version/activate", {
    schema: {
      params: {
        type: "object",
        properties: {
          version: { type: "string", pattern: "^\\d+$" }
        },
        required: ["version"]
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { version: string };
    const version = parsePositiveInt(params.version);
    if (version === null) {
      reply.code(400);
      return { message: "invalid version" };
    }
    const actor = currentUserId(request);
    const activated = service.activateGlobalOrchestrationPolicy(version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "global orchestration policy version not found" };
    }
    return activated;
  });

  app.post("/governance/orchestration/policies/restore-initial", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const actor = currentUserId(request);
    const restored = service.restoreGlobalOrchestrationPolicyToInitialMode(actor);
    if (!restored) {
      reply.code(500);
      return { message: "failed to restore global orchestration policy" };
    }
    return restored;
  });

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
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return {
      active: service.getActiveProjectPolicy(projectId),
      items: service.listProjectPolicies(projectId)
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
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request);
    return service.createProjectPolicyDraft(projectId, actor, body?.strategy);
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
      return { message: "invalid project id or version" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const actor = currentUserId(request);
    const activated = service.activateProjectPolicy(projectId, version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "policy version not found" };
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
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const actor = currentUserId(request);
    const restored = service.restoreProjectOrchestrationPolicyToInitialMode(projectId, actor);
    if (!restored) {
      reply.code(500);
      return { message: "failed to restore project orchestration policy" };
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
          openclawProfile: { type: "string" },
          agentId: { type: "string" },
          workspacePath: { type: "string" },
          runtimeMode: { type: "string", enum: ["openclaw-native", "bridge"] },
          locked: { type: "boolean" }
        },
        required: ["openclawProfile", "workspacePath"],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as {
      openclawProfile?: string;
      agentId?: string;
      workspacePath?: string;
      runtimeMode?: "openclaw-native" | "bridge";
      locked?: boolean;
    } | null;
    if (!body?.openclawProfile?.trim() || !body?.workspacePath?.trim()) {
      reply.code(400);
      return { message: "openclawProfile and workspacePath are required" };
    }
    const actor = currentUserId(request);
    try {
      return service.upsertProjectWorkspaceBinding({
        projectId,
        openclawProfile: body.openclawProfile.trim(),
        agentId: body.agentId?.trim() || "main",
        workspacePath: body.workspacePath.trim(),
        runtimeMode: body.runtimeMode === "bridge" ? "bridge" : "openclaw-native",
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
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    return service.listTenantMemberBindings(access.tenantId);
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
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as { userId?: string; role?: "admin" | "member" | "viewer" } | null;
    if (!body?.userId?.trim() || !body?.role) {
      reply.code(400);
      return { message: "userId and role are required" };
    }
    return service.upsertTenantMemberBinding({
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
      return { message: "invalid project id or user id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const removed = service.removeTenantMemberBinding(access.tenantId, userId);
    if (!removed) {
      reply.code(404);
      return { message: "role binding not found" };
    }
    return { ok: true, projectId, userId };
  });

  registerWorkspacePolicyExecutionRoutes(app, service);
}
