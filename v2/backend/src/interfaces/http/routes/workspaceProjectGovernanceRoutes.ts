import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, isAdmin, isValidPhone } from "./workspaceRouteUtils";

function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!isAdmin(currentRole(request.authRole))) { reply.code(403); return false; }
  return true;
}

async function handleGetAuditLogs(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return { message: "没有权限" };
  const query = request.query as { limit?: string } | null;
  const limit = query?.limit ? Number(query.limit) : 50;
  if (!Number.isFinite(limit) || limit <= 0) { reply.code(400); return { message: "无效的分页参数" }; }
  return service.governance.listAuditLogs(Math.min(200, Math.floor(limit)));
}

async function handleListRoleBindings(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return { message: "没有权限" };
  return service.governance.listPlatformRoleBindings();
}

async function handleUpsertRoleBinding(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return { message: "没有权限" };
  const body = request.body as { userId?: string; role?: string } | null;
  const userId = body?.userId?.trim() || "";
  const roleKey = body?.role?.trim() || "";
  if (!userId || !roleKey) { reply.code(400); return { message: "请提供用户 ID 和角色" }; }
  if (!isValidPhone(userId)) { reply.code(400); return { message: "用户 ID 必须为 11 位手机号" }; }
  const builtinRoles = new Set<string>(service.governance.listGovernanceRoles().map((r) => r.id));
  const customRoles = new Set<string>(service.governance.listGovernanceCustomRoles().map((r) => r.roleKey));
  const legacyRoles = new Set<string>(["admin", "member", "viewer"]);
  if (!builtinRoles.has(roleKey) && !customRoles.has(roleKey) && !legacyRoles.has(roleKey)) {
    reply.code(400); return { message: `未知角色：${roleKey}` };
  }
  return service.governance.upsertPlatformRoleBinding({ userId, role: roleKey });
}

async function handleRemoveRoleBinding(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return { message: "没有权限" };
  const userId = ((request.params as { userId: string }).userId || "").trim();
  if (!userId) { reply.code(400); return { message: "无效的用户 ID" }; }
  const removed = service.governance.removePlatformRoleBinding(userId);
  if (!removed) { reply.code(404); return { message: "角色绑定不存在" }; }
  return { ok: true, userId };
}

async function handleUpsertCustomRole(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return { message: "没有权限" };
  const body = request.body as { roleKey?: string; name?: string; description?: string; level?: number; permissions?: string[] } | null;
  const name = body?.name?.trim() || "";
  if (!name) { reply.code(400); return { message: "名称不能为空" }; }
  const allowed = new Set(service.governance.listGovernancePermissionPoints().map((p) => p.key));
  const submitted = Array.isArray(body?.permissions) ? body?.permissions : [];
  const invalid = submitted.filter((p) => !allowed.has(p));
  if (invalid.length > 0) { reply.code(400); return { message: `未知权限项：${invalid.join("、")}` }; }
  return service.governance.upsertGovernanceCustomRole({
    roleKey: body?.roleKey?.trim() || "", name, description: body?.description?.trim() || "",
    level: Number.isFinite(body?.level) ? Number(body?.level) : 1, permissions: submitted,
  });
}

async function handleRemoveCustomRole(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (!requireAdmin(request, reply)) return { message: "没有权限" };
  const roleKey = ((request.params as { roleKey: string }).roleKey || "").trim();
  if (!roleKey) { reply.code(400); return { message: "无效的角色标识" }; }
  const removed = service.governance.removeGovernanceCustomRole(roleKey);
  if (!removed) { reply.code(404); return { message: "自定义角色不存在" }; }
  return { ok: true, roleKey };
}

export function registerWorkspaceProjectGovernanceRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/governance/roles", async () => service.governance.listGovernanceRoles());
  app.get("/governance/permission-points", async () => service.governance.listGovernancePermissionPoints());

  app.get("/governance/audit-logs", {
    schema: { querystring: { type: "object", properties: { limit: { type: "string" } } } }
  }, (req, rep) => handleGetAuditLogs(service, req, rep));

  app.get("/governance/platform-role-bindings", (req, rep) => handleListRoleBindings(service, req, rep));

  app.post("/governance/platform-role-bindings", {
    schema: { body: { type: "object", properties: { userId: { type: "string" }, role: { type: "string" } }, required: ["userId", "role"], additionalProperties: false } }
  }, (req, rep) => handleUpsertRoleBinding(service, req, rep));

  app.delete("/governance/platform-role-bindings/:userId", {
    schema: { params: { type: "object", properties: { userId: { type: "string", minLength: 1 } }, required: ["userId"] } }
  }, (req, rep) => handleRemoveRoleBinding(service, req, rep));

  app.get("/governance/custom-roles", async () => service.governance.listGovernanceCustomRoles());

  app.post("/governance/custom-roles", {
    schema: { body: { type: "object", properties: {
      roleKey: { type: "string" }, name: { type: "string" }, description: { type: "string" },
      level: { type: "number" }, permissions: { type: "array", items: { type: "string" } },
    }, required: ["name"], additionalProperties: false } }
  }, (req, rep) => handleUpsertCustomRole(service, req, rep));

  app.delete("/governance/custom-roles/:roleKey", {
    schema: { params: { type: "object", properties: { roleKey: { type: "string", minLength: 1 } }, required: ["roleKey"] } }
  }, (req, rep) => handleRemoveCustomRole(service, req, rep));
}
