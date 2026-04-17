import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentUserId, ensureProjectAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";

/* ── Shared guard ── */

const projectIdParamSchema = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id" as const]
};

function resolveProjectId(reply: FastifyReply, raw: string) {
  const projectId = parsePositiveInt(raw);
  if (projectId === null) {
    reply.code(400);
  }
  return projectId;
}

/* ── Route handlers ── */

function handleListPolicies(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = resolveProjectId(reply, (request.params as { id: string }).id);
    if (projectId === null) return { message: "无效的项目 ID" };
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    return {
      active: service.governance.getActiveProjectPolicy(projectId),
      items: service.governance.listProjectPolicies(projectId)
    };
  };
}

function handleCreatePolicy(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = resolveProjectId(reply, (request.params as { id: string }).id);
    if (projectId === null) return { message: "无效的项目 ID" };
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    const body = request.body as { strategy?: Record<string, unknown> } | null;
    const actor = currentUserId(request);
    return service.governance.createProjectPolicyDraft(projectId, actor, body?.strategy);
  };
}

function handleActivatePolicy(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string; version: string };
    const projectId = parsePositiveInt(params.id);
    const version = parsePositiveInt(params.version);
    if (projectId === null || version === null) {
      reply.code(400);
      return { message: "无效的项目或版本" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    const actor = currentUserId(request);
    const activated = service.governance.activateProjectPolicy(projectId, version, actor);
    if (!activated) {
      reply.code(404);
      return { message: "策略版本不存在" };
    }
    return activated;
  };
}

function handleRestoreInitialPolicy(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = resolveProjectId(reply, (request.params as { id: string }).id);
    if (projectId === null) return { message: "无效的项目 ID" };
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    const actor = currentUserId(request);
    const restored = service.governance.restoreProjectOrchestrationPolicyToInitialMode(projectId, actor);
    if (!restored) {
      reply.code(500);
      return { message: "项目编排策略恢复失败" };
    }
    return restored;
  };
}

function handleBindWorkspace(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = resolveProjectId(reply, (request.params as { id: string }).id);
    if (projectId === null) return { message: "无效的项目 ID" };
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
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
    const { assistantProfile, agentId, workspacePath, runtimeMode, locked } = body;
    return executeBindWorkspace(service, request, reply, projectId, { assistantProfile: assistantProfile.trim(), agentId, workspacePath: workspacePath.trim(), runtimeMode, locked });
  };
}

function executeBindWorkspace(
  service: WorkspaceService,
  request: FastifyRequest,
  reply: FastifyReply,
  projectId: number,
  body: { assistantProfile: string; agentId?: string; workspacePath: string; runtimeMode?: "native" | "bridge"; locked?: boolean }
) {
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
}

function handleListRoles(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = resolveProjectId(reply, (request.params as { id: string }).id);
    if (projectId === null) return { message: "无效的项目 ID" };
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    return service.governance.listTenantMemberBindings(access.tenantId);
  };
}

function handleUpsertRole(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const projectId = resolveProjectId(reply, (request.params as { id: string }).id);
    if (projectId === null) return { message: "无效的项目 ID" };
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
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
  };
}

function handleDeleteRole(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string; userId: string };
    const projectId = parsePositiveInt(params.id);
    const userId = (params.userId || "").trim();
    if (projectId === null || !userId) {
      reply.code(400);
      return { message: "无效的项目或用户" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    const removed = service.governance.removeTenantMemberBinding(access.tenantId, userId);
    if (!removed) {
      reply.code(404);
      return { message: "角色绑定不存在" };
    }
    return { ok: true, projectId, userId };
  };
}

/* ── Registration ── */

const policyVersionParamSchema = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" }, version: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id" as const, "version" as const],
};
const workspaceBindBodySchema = {
  type: "object" as const,
  properties: {
    assistantProfile: { type: "string" as const }, agentId: { type: "string" as const }, workspacePath: { type: "string" as const },
    runtimeMode: { type: "string" as const, enum: ["native", "bridge"] }, locked: { type: "boolean" as const },
  },
  required: ["assistantProfile" as const, "workspacePath" as const], additionalProperties: false,
};
const roleBodySchema = {
  type: "object" as const,
  properties: { userId: { type: "string" as const }, role: { type: "string" as const, enum: ["admin", "member", "viewer"] } },
  required: ["userId" as const, "role" as const], additionalProperties: false,
};
const roleDeleteParamSchema = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" }, userId: { type: "string" as const, minLength: 1 } },
  required: ["id" as const, "userId" as const],
};

export function registerWorkspacePolicyProjectRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/policies", { schema: { params: projectIdParamSchema } }, handleListPolicies(service));
  app.post("/projects/:id/policies", {
    schema: { params: projectIdParamSchema, body: { type: "object", properties: { strategy: { type: "object" } }, additionalProperties: false } }
  }, handleCreatePolicy(service));
  app.post("/projects/:id/policies/:version/activate", { schema: { params: policyVersionParamSchema } }, handleActivatePolicy(service));
  app.post("/projects/:id/policies/restore-initial", { schema: { params: projectIdParamSchema } }, handleRestoreInitialPolicy(service));
  app.post("/projects/:id/workspace/bind", { schema: { params: projectIdParamSchema, body: workspaceBindBodySchema } }, handleBindWorkspace(service));
  app.get("/projects/:id/roles", { schema: { params: projectIdParamSchema } }, handleListRoles(service));
  app.post("/projects/:id/roles", { schema: { params: projectIdParamSchema, body: roleBodySchema } }, handleUpsertRole(service));
  app.delete("/projects/:id/roles/:userId", { schema: { params: roleDeleteParamSchema } }, handleDeleteRole(service));
}
