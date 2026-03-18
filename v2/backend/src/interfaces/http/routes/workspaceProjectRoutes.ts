import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { currentRole, isAdmin, isValidPhone, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspaceProjectRoutes(app: FastifyInstance, service: WorkspaceService) {
  const validVersionTypes = new Set(["major", "minor", "patch"]);

  app.get("/api/governance/roles", async () => {
    return service.listGovernanceRoles();
  });

  app.get("/api/governance/permission-points", async () => {
    return service.listGovernancePermissionPoints();
  });

  app.get("/api/governance/audit-logs", async (request, reply) => {
    const query = request.query as { limit?: string } | null;
    const limit = query?.limit ? Number(query.limit) : 50;
    if (!Number.isFinite(limit) || limit <= 0) {
      reply.code(400);
      return { message: "invalid limit" };
    }
    return service.listAuditLogs(Math.min(200, Math.floor(limit)));
  });

  app.get("/api/governance/platform-role-bindings", async () => {
    return service.listPlatformRoleBindings();
  });

  app.post("/api/governance/platform-role-bindings", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
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
    const builtinRoles = new Set<string>(service.listGovernanceRoles().map((item) => item.id));
    const customRoles = new Set<string>(service.listGovernanceCustomRoles().map((item) => item.roleKey));
    const legacyRoles = new Set<string>(["admin", "member", "viewer"]);
    if (!builtinRoles.has(roleKey) && !customRoles.has(roleKey) && !legacyRoles.has(roleKey)) {
      reply.code(400);
      return { message: `unknown role: ${roleKey}` };
    }
    return service.upsertPlatformRoleBinding({ userId, role: roleKey });
  });

  app.delete("/api/governance/platform-role-bindings/:userId", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { userId: string };
    const userId = (params.userId || "").trim();
    if (!userId) {
      reply.code(400);
      return { message: "invalid user id" };
    }
    const removed = service.removePlatformRoleBinding(userId);
    if (!removed) {
      reply.code(404);
      return { message: "role binding not found" };
    }
    return { ok: true, userId };
  });

  const listCustomRolesHandler = async () => service.listGovernanceCustomRoles();

  const upsertCustomRolesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
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
    const permissionPoints = service.listGovernancePermissionPoints();
    const allowed = new Set(permissionPoints.map((item) => item.key));
    const submitted = Array.isArray(body?.permissions) ? body?.permissions : [];
    const invalid = submitted.filter((item) => !allowed.has(item));
    if (invalid.length > 0) {
      reply.code(400);
      return { message: `unknown permissions: ${invalid.join(",")}` };
    }
    return service.upsertGovernanceCustomRole({
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
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { roleKey: string };
    const roleKey = (params.roleKey || "").trim();
    if (!roleKey) {
      reply.code(400);
      return { message: "invalid role key" };
    }
    const removed = service.removeGovernanceCustomRole(roleKey);
    if (!removed) {
      reply.code(404);
      return { message: "custom role not found" };
    }
    return { ok: true, roleKey };
  };

  app.get("/api/governance/custom-roles", listCustomRolesHandler);
  app.post("/api/governance/custom-roles", upsertCustomRolesHandler);
  app.delete("/api/governance/custom-roles/:roleKey", removeCustomRoleHandler);

  app.post("/api/governance/openclaw/chat", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const body = request.body as { message?: string } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
    }
    try {
      return await service.openclawDirectChatGlobal(message);
    } catch (error) {
      reply.code(500);
      return { message: error instanceof Error ? error.message : "openclaw chat failed" };
    }
  });

  app.get("/api/governance/openclaw/status", async () => {
    return service.probeOpenclawIntegration();
  });

  app.get("/api/projects", async () => {
    return service.listProjects();
  });

  app.post("/api/projects", async (request, reply) => {
    const body = request.body as { name?: string; description?: string } | null;
    const name = body?.name?.trim();
    if (!name) {
      reply.code(400);
      return { message: "name is required" };
    }
    return service.createProject({
      name,
      description: body?.description?.trim() || "暂无描述"
    });
  });

  app.delete("/api/projects/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const archived = service.archiveProject(projectId);
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

  app.get("/api/projects/:id/iterations", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const items = service.listIterations(projectId);
    if (items === null) {
      reply.code(404);
      return { message: "project not found" };
    }
    return items;
  });

  app.post("/api/projects/:id/iterations", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
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
    const created = service.createIteration(projectId, {
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
}
