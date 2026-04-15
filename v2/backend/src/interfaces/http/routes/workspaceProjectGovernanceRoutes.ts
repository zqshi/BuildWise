import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, isAdmin, isValidPhone } from "./workspaceRouteUtils";

export function registerWorkspaceProjectGovernanceRoutes(app: FastifyInstance, service: WorkspaceService) {
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
      return { message: "没有权限" };
    }
    const query = request.query as { limit?: string } | null;
    const limit = query?.limit ? Number(query.limit) : 50;
    if (!Number.isFinite(limit) || limit <= 0) {
      reply.code(400);
      return { message: "无效的分页参数" };
    }
    return service.governance.listAuditLogs(Math.min(200, Math.floor(limit)));
  });

  app.get("/governance/platform-role-bindings", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "没有权限" };
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
      return { message: "没有权限" };
    }
    const body = request.body as { userId?: string; role?: string } | null;
    const userId = body?.userId?.trim() || "";
    const roleKey = body?.role?.trim() || "";
    if (!userId || !roleKey) {
      reply.code(400);
      return { message: "请提供用户 ID 和角色" };
    }
    if (!isValidPhone(userId)) {
      reply.code(400);
      return { message: "用户 ID 必须为 11 位手机号" };
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
      return { message: "没有权限" };
    }
    const params = request.params as { userId: string };
    const userId = (params.userId || "").trim();
    if (!userId) {
      reply.code(400);
      return { message: "无效的用户 ID" };
    }
    const removed = service.governance.removePlatformRoleBinding(userId);
    if (!removed) {
      reply.code(404);
      return { message: "角色绑定不存在" };
    }
    return { ok: true, userId };
  });

  const listCustomRolesHandler = async () => service.governance.listGovernanceCustomRoles();

  const upsertCustomRolesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: "没有权限" };
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
      return { message: "名称不能为空" };
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
      return { message: "没有权限" };
    }
    const params = request.params as { roleKey: string };
    const roleKey = (params.roleKey || "").trim();
    if (!roleKey) {
      reply.code(400);
      return { message: "无效的角色标识" };
    }
    const removed = service.governance.removeGovernanceCustomRole(roleKey);
    if (!removed) {
      reply.code(404);
      return { message: "自定义角色不存在" };
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
}
