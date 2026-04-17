import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, currentTenantId, currentUserId, ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

const VALID_VERSION_TYPES = new Set(["major", "minor", "patch"]);

const ID_PARAM_SCHEMA = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id"] as const
};

const ID_ITER_PARAM_SCHEMA = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" }, iterationId: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id", "iterationId"] as const
};

async function handleListProjects(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const userId = currentUserId(request);
  if (!userId) { reply.code(401); return { message: "请先登录" }; }
  const tenantId = currentTenantId(request);
  if (tenantId) {
    const tenantAccess = service.project.getTenantAccess(userId, tenantId);
    if (!tenantAccess.canRead) { reply.code(403); return { message: "没有权限" }; }
  }
  return service.project.listProjectsForUser(userId, tenantId || undefined);
}

async function handleCreateProject(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const role = currentRole(request.authRole);
  if (role === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const body = request.body as { name?: string; description?: string } | null;
  const name = body?.name?.trim();
  if (!name) { reply.code(400); return { message: "名称不能为空" }; }
  const actor = currentUserId(request);
  if (!actor) { reply.code(401); return { message: "请先登录" }; }
  const tenantId = currentTenantId(request) || actor;
  const tenantAccess = service.project.getTenantAccess(actor, tenantId);
  if (!tenantAccess.canWrite) { reply.code(403); return { message: "没有权限" }; }
  return service.project.createProject({ name, description: body?.description?.trim() || "暂无描述", tenantId, ownerUserId: tenantId });
}

async function handleDeleteProject(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "admin");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const archived = service.project.archiveProject(projectId);
  if (!archived) { reply.code(404); return { message: "项目不存在" }; }
  return { ok: true, projectId: archived.id, deletedAt: archived.deletedAt || "" };
}

async function handleListIterations(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const items = service.iteration.listIterations(projectId);
  if (items === null) { reply.code(404); return { message: "项目不存在" }; }
  return items;
}

async function handleCreateIteration(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = request.body as {
    name?: string; description?: string; versionType?: string;
    goals?: string[]; scope?: { inScope?: string[]; outOfScope?: string[]; acceptanceCriteria?: string[] }; aiSummary?: string;
  } | null;
  const name = body?.name?.trim();
  if (!name) { reply.code(400); return { message: "名称不能为空" }; }
  const versionType = body?.versionType?.trim().toLowerCase() || "patch";
  if (!VALID_VERSION_TYPES.has(versionType)) { reply.code(400); return { message: "版本类型必须是 major、minor 或 patch" }; }
  const created = service.iteration.createIteration(projectId, {
    name, description: body?.description?.trim() || "暂无描述",
    versionType: versionType as "major" | "minor" | "patch",
    goals: Array.isArray(body?.goals) ? body?.goals : [], aiSummary: body?.aiSummary || "",
    scope: {
      inScope: Array.isArray(body?.scope?.inScope) ? body?.scope?.inScope : [],
      outOfScope: Array.isArray(body?.scope?.outOfScope) ? body?.scope?.outOfScope : [],
      acceptanceCriteria: Array.isArray(body?.scope?.acceptanceCriteria) ? body?.scope?.acceptanceCriteria : [],
    },
  });
  if (!created) { reply.code(404); return { message: "项目不存在" }; }
  return created;
}

async function handleDeleteIteration(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; iterationId: string };
  const projectId = parsePositiveInt(params.id);
  const iterationId = parsePositiveInt(params.iterationId);
  if (projectId === null || iterationId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "admin");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const result = service.iteration.deleteIteration(iterationId);
  if (!result.deleted) {
    if (result.reason === "not_found") { reply.code(404); return { message: "迭代不存在" }; }
    reply.code(409); return { message: "该版本已产生迭代数据，不可删除", code: "iteration_has_data" };
  }
  return { deleted: true };
}

export function registerWorkspaceProjectCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects", (req, rep) => handleListProjects(service, req, rep));

  app.post("/projects", {
    schema: { body: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } }, required: ["name"], additionalProperties: false } }
  }, (req, rep) => handleCreateProject(service, req, rep));

  app.delete("/projects/:id", { schema: { params: ID_PARAM_SCHEMA } },
    (req, rep) => handleDeleteProject(service, req, rep));

  app.get("/projects/:id/iterations", { schema: { params: ID_PARAM_SCHEMA } },
    (req, rep) => handleListIterations(service, req, rep));

  app.post("/projects/:id/iterations", {
    schema: { params: ID_PARAM_SCHEMA, body: { type: "object", properties: {
      name: { type: "string" }, description: { type: "string" },
      versionType: { type: "string", enum: ["major", "minor", "patch"] },
      goals: { type: "array", items: { type: "string" } }, scope: { type: "object" }, aiSummary: { type: "string" },
    }, required: ["name"], additionalProperties: false } }
  }, (req, rep) => handleCreateIteration(service, req, rep));

  app.delete("/projects/:id/iterations/:iterationId", { schema: { params: ID_ITER_PARAM_SCHEMA } },
    (req, rep) => handleDeleteIteration(service, req, rep));
}
