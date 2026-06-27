import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt, currentUserId, resolveAuthTenantId } from "./workspaceRouteUtils";
import { buildDefaultExperiencePolicy } from "../../../domain/workspace/experiencePolicyTypes";

const ID_PARAM = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id"] as const };

async function handleGetPlatformPolicy(service: WorkspaceService, _request: FastifyRequest, _reply: FastifyReply) {
  return service.experience.getPlatformPolicy();
}

async function handleUpdatePlatformPolicy(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const actor = currentUserId(request) || "system";
  const body = request.body as Record<string, unknown> | null;
  if (!body) { reply.code(400); return { message: "请求体不能为空" }; }

  const currentPolicy = service.experience.getPlatformPolicy();
  if (currentPolicy.id === 0) {
    const defaultPolicy = buildDefaultExperiencePolicy(actor, { scope: "platform", projectId: 0 });
    const created = service.experience.createPolicy(defaultPolicy, actor);
    if (body.rules || body.scheduleScanEnabled !== undefined || body.scheduleScanIntervalDays !== undefined) {
      return service.experience.updatePolicy(created.id, {
        rules: body.rules as typeof created.rules | undefined,
        scheduleScanEnabled: body.scheduleScanEnabled as boolean | undefined,
        scheduleScanIntervalDays: body.scheduleScanIntervalDays as number | undefined
      }) ?? created;
    }
    return created;
  }

  const updated = service.experience.updatePolicy(currentPolicy.id, {
    rules: body.rules as typeof currentPolicy.rules | undefined,
    scheduleScanEnabled: body.scheduleScanEnabled as boolean | undefined,
    scheduleScanIntervalDays: body.scheduleScanIntervalDays as number | undefined
  });
  if (!updated) { reply.code(404); return { message: "策略不存在" }; }
  return updated;
}

async function handleGetProjectPolicy(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  return service.experience.getEffectivePolicy(projectId);
}

async function handleUpdateProjectPolicy(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };

  const actor = currentUserId(request) || "system";
  const body = request.body as Record<string, unknown> | null;
  if (!body) { reply.code(400); return { message: "请求体不能为空" }; }

  const existingProject = service.experience.getEffectivePolicy(projectId);
  if (existingProject.scope === "project" && existingProject.projectId === projectId) {
    return service.experience.updatePolicy(existingProject.id, {
      rules: body.rules as typeof existingProject.rules | undefined,
      scheduleScanEnabled: body.scheduleScanEnabled as boolean | undefined,
      scheduleScanIntervalDays: body.scheduleScanIntervalDays as number | undefined
    }) ?? existingProject;
  }

  const defaultPolicy = buildDefaultExperiencePolicy(actor, { scope: "project", projectId });
  const created = service.experience.createPolicy({
    ...defaultPolicy,
    rules: (body.rules as typeof defaultPolicy.rules) ?? defaultPolicy.rules,
    scheduleScanEnabled: (body.scheduleScanEnabled as boolean) ?? defaultPolicy.scheduleScanEnabled,
    scheduleScanIntervalDays: (body.scheduleScanIntervalDays as number) ?? defaultPolicy.scheduleScanIntervalDays
  }, actor);
  reply.code(201);
  return created;
}

async function handleDeleteProjectPolicy(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const deleted = service.experience.deleteProjectPolicy(projectId);
  if (!deleted) { reply.code(404); return { message: "该项目没有自定义策略" }; }
  return { message: "已恢复为平台默认策略" };
}

async function handleListExtractions(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  return service.experience.listExtractions(projectId);
}

async function handleTriggerScan(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const result = await service.experience.runFullScan(projectId);
  return result;
}

async function handleSearchAcrossProjects(service: WorkspaceService, request: FastifyRequest, _reply: FastifyReply) {
  const query = (request.query as Record<string, string>).q || "";
  const tenantId = resolveAuthTenantId(request, "");
  const limit = Number.parseInt((request.query as Record<string, string>).limit || "20", 10);
  return service.experience.searchAcrossProjects(query, tenantId, Math.min(limit, 50));
}

async function handleCrossProjectInsights(service: WorkspaceService, request: FastifyRequest, _reply: FastifyReply) {
  const tenantId = resolveAuthTenantId(request, "");
  return service.experience.getCrossProjectInsights(tenantId);
}

export function registerExperienceRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/experience/policy", (req, rep) => handleGetPlatformPolicy(service, req, rep));
  app.put("/experience/policy", (req, rep) => handleUpdatePlatformPolicy(service, req, rep));
  app.get("/experience/search", (req, rep) => handleSearchAcrossProjects(service, req, rep));
  app.get("/experience/insights", (req, rep) => handleCrossProjectInsights(service, req, rep));

  app.get("/projects/:id/experience/policy", { schema: { params: ID_PARAM } }, (req, rep) => handleGetProjectPolicy(service, req, rep));
  app.put("/projects/:id/experience/policy", { schema: { params: ID_PARAM } }, (req, rep) => handleUpdateProjectPolicy(service, req, rep));
  app.delete("/projects/:id/experience/policy", { schema: { params: ID_PARAM } }, (req, rep) => handleDeleteProjectPolicy(service, req, rep));
  app.get("/projects/:id/experience/extractions", { schema: { params: ID_PARAM } }, (req, rep) => handleListExtractions(service, req, rep));
  app.post("/projects/:id/experience/extract", { schema: { params: ID_PARAM } }, (req, rep) => handleTriggerScan(service, req, rep));
}
