import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, currentTenantId, currentUserId, ensureProjectAccess, isAdmin, isValidPhone, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspaceProjectRoutes(app: FastifyInstance, service: WorkspaceService) {
  const validVersionTypes = new Set(["major", "minor", "patch"]);

  app.get("/governance/roles", async () => {
    return service.governance.listGovernanceRoles();
  });

  app.get("/governance/permission-points", async () => {
    return service.governance.listGovernancePermissionPoints();
  });

  app.get("/governance/audit-logs", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          limit: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const query = request.query as { limit?: string } | null;
    const limit = query?.limit ? Number(query.limit) : 50;
    if (!Number.isFinite(limit) || limit <= 0) {
      reply.code(400);
      return { message: "invalid limit" };
    }
    return service.governance.listAuditLogs(Math.min(200, Math.floor(limit)));
  });

  app.get("/governance/platform-role-bindings", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    return service.governance.listPlatformRoleBindings();
  });

  app.post("/governance/platform-role-bindings", {
    schema: {
      body: {
        type: "object",
        properties: {
          userId: { type: "string" },
          role: { type: "string" }
        },
        required: ["userId", "role"],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { userId?: string; role?: string } | null;
    const userId = body?.userId?.trim() || "";
    const roleKey = body?.role?.trim() || "";
    if (!userId || !roleKey) {
      reply.code(400);
      return { message: "userId and role are required" };
    }
    if (!isValidPhone(userId)) {
      reply.code(400);
      return { message: "userId must be 11-digit mainland phone" };
    }
    const builtinRoles = new Set<string>(service.governance.listGovernanceRoles().map((item) => item.id));
    const customRoles = new Set<string>(service.governance.listGovernanceCustomRoles().map((item) => item.roleKey));
    const legacyRoles = new Set<string>(["admin", "member", "viewer"]);
    if (!builtinRoles.has(roleKey) && !customRoles.has(roleKey) && !legacyRoles.has(roleKey)) {
      reply.code(400);
      return { message: `unknown role: ${roleKey}` };
    }
    return service.governance.upsertPlatformRoleBinding({ userId, role: roleKey });
  });

  app.delete("/governance/platform-role-bindings/:userId", {
    schema: {
      params: {
        type: "object",
        properties: {
          userId: { type: "string", minLength: 1 }
        },
        required: ["userId"]
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { userId: string };
    const userId = (params.userId || "").trim();
    if (!userId) {
      reply.code(400);
      return { message: "invalid user id" };
    }
    const removed = service.governance.removePlatformRoleBinding(userId);
    if (!removed) {
      reply.code(404);
      return { message: "role binding not found" };
    }
    return { ok: true, userId };
  });

  const listCustomRolesHandler = async () => service.governance.listGovernanceCustomRoles();

  const upsertCustomRolesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as {
      roleKey?: string;
      name?: string;
      description?: string;
      level?: number;
      permissions?: string[];
    } | null;
    const name = body?.name?.trim() || "";
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    const permissionPoints = service.governance.listGovernancePermissionPoints();
    const allowed = new Set(permissionPoints.map((item) => item.key));
    const submitted = Array.isArray(body?.permissions) ? body?.permissions : [];
    const invalid = submitted.filter((item) => !allowed.has(item));
    if (invalid.length > 0) {
      reply.code(400);
      return { message: `unknown permissions: ${invalid.join(",")}` };
    }
    return service.governance.upsertGovernanceCustomRole({
      roleKey: body?.roleKey?.trim() || "",
      name,
      description: body?.description?.trim() || "",
      level: Number.isFinite(body?.level) ? Number(body?.level) : 1,
      permissions: submitted
    });
  };

  const removeCustomRoleHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { roleKey: string };
    const roleKey = (params.roleKey || "").trim();
    if (!roleKey) {
      reply.code(400);
      return { message: "invalid role key" };
    }
    const removed = service.governance.removeGovernanceCustomRole(roleKey);
    if (!removed) {
      reply.code(404);
      return { message: "custom role not found" };
    }
    return { ok: true, roleKey };
  };

  app.get("/governance/custom-roles", listCustomRolesHandler);
  app.post("/governance/custom-roles", {
    schema: {
      body: {
        type: "object",
        properties: {
          roleKey: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          level: { type: "number" },
          permissions: { type: "array", items: { type: "string" } }
        },
        required: ["name"],
        additionalProperties: false
      }
    }
  }, upsertCustomRolesHandler);
  app.delete("/governance/custom-roles/:roleKey", {
    schema: {
      params: {
        type: "object",
        properties: {
          roleKey: { type: "string", minLength: 1 }
        },
        required: ["roleKey"]
      }
    }
  }, removeCustomRoleHandler);

  app.get("/projects", async (request, reply) => {
    const userId = currentUserId(request);
    if (!userId) {
      reply.code(401);
      return { message: "authentication required" };
    }
    const tenantId = currentTenantId(request);
    if (tenantId) {
      const tenantAccess = service.project.getTenantAccess(userId, tenantId);
      if (!tenantAccess.canRead) {
        reply.code(403);
        return { message: "permission denied" };
      }
    }
    return service.project.listProjectsForUser(userId, tenantId || undefined);
  });

  app.post("/projects", {
    schema: {
      body: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" }
        },
        required: ["name"],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { name?: string; description?: string } | null;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    const actor = currentUserId(request);
    if (!actor) {
      reply.code(401);
      return { message: "authentication required" };
    }
    const tenantId = currentTenantId(request) || actor;
    const tenantAccess = service.project.getTenantAccess(actor, tenantId);
    if (!tenantAccess.canWrite) {
      reply.code(403);
      return { message: "permission denied" };
    }
    return service.project.createProject({
      name,
      description: body?.description?.trim() || "暂无描述",
      tenantId,
      ownerUserId: tenantId
    });
  });

  app.delete("/projects/:id", {
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
    const archived = service.project.archiveProject(projectId);
    if (!archived) {
      reply.code(404);
      return { message: "project not found" };
    }
    return {
      ok: true,
      projectId: archived.id,
      deletedAt: archived.deletedAt || ""
    };
  });

  app.get("/projects/:id/iterations", {
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
    const items = service.iteration.listIterations(projectId);
    if (items === null) {
      reply.code(404);
      return { message: "project not found" };
    }
    return items;
  });

  app.post("/projects/:id/iterations", {
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
          name: { type: "string" },
          description: { type: "string" },
          versionType: { type: "string", enum: ["major", "minor", "patch"] },
          goals: { type: "array", items: { type: "string" } },
          scope: { type: "object" },
          aiSummary: { type: "string" }
        },
        required: ["name"],
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
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as {
      name?: string;
      description?: string;
      versionType?: string;
      goals?: string[];
      scope?: {
        inScope?: string[];
        outOfScope?: string[];
        acceptanceCriteria?: string[];
      };
      aiSummary?: string;
    } | null;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    const versionType = body?.versionType?.trim().toLowerCase() || "patch";
    if (!validVersionTypes.has(versionType)) {
      reply.code(400);
      return { message: "versionType must be one of: major, minor, patch" };
    }
    const created = service.iteration.createIteration(projectId, {
      name,
      description: body?.description?.trim() || "暂无描述",
      versionType: versionType as "major" | "minor" | "patch",
      goals: Array.isArray(body?.goals) ? body?.goals : [],
      aiSummary: body?.aiSummary || "",
      scope: {
        inScope: Array.isArray(body?.scope?.inScope) ? body?.scope?.inScope : [],
        outOfScope: Array.isArray(body?.scope?.outOfScope) ? body?.scope?.outOfScope : [],
        acceptanceCriteria: Array.isArray(body?.scope?.acceptanceCriteria) ? body?.scope?.acceptanceCriteria : []
      }
    });
    if (!created) {
      reply.code(404);
      return { message: "project not found" };
    }
    return created;
  });

  app.delete("/projects/:id/iterations/:iterationId", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" },
          iterationId: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id", "iterationId"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string; iterationId: string };
    const projectId = parsePositiveInt(params.id);
    const iterationId = parsePositiveInt(params.iterationId);
    if (projectId === null || iterationId === null) {
      reply.code(400);
      return { message: "invalid id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const result = service.iteration.deleteIteration(iterationId);
    if (!result.deleted) {
      if (result.reason === "not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      reply.code(409);
      return { message: "该版本已产生迭代数据，不可删除", code: "iteration_has_data" };
    }
    return { deleted: true };
  });
}
