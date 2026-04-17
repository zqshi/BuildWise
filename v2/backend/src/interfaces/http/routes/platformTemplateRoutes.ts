import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

function handleRunTemplate(service: PlatformService, workspaceService: WorkspaceService, ensurePermission: EnsurePermission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const permit = ensurePermission(request.authRole, "template:run", workspaceService);
    if (!permit.ok) { reply.code(403); return { message: "没有权限" }; }
    const params = request.params as { id: string };
    const body = request.body as { projectId?: number; parameters?: Record<string, string> } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    if (!projectId) { reply.code(400); return { message: "请提供项目 ID" }; }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    const result = service.runTemplateWithParams(params.id, projectId, body?.parameters || {});
    if (!result) { reply.code(404); return { message: "模板或项目不存在" }; }
    return result;
  };
}

function handleListTemplateRuns(service: PlatformService, workspaceService: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId ?? "");
    if (projectId === null) { reply.code(400); return { message: "请提供项目 ID" }; }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    return service.listTemplateRuns(projectId);
  };
}

export function registerTemplateRoutes(app: FastifyInstance, service: PlatformService, workspaceService: WorkspaceService, ensurePermission: EnsurePermission) {
  app.get("/templates", async () => service.listTemplates());
  app.post("/templates/:id/run", {
    schema: { params: { type: "object", properties: { id: { type: "string" } } },
      body: { type: "object", properties: { projectId: { type: "integer" }, parameters: { type: "object" } }, additionalProperties: false } }
  }, handleRunTemplate(service, workspaceService, ensurePermission));
  app.get("/templates/runs", {
    schema: { querystring: { type: "object", properties: { projectId: { type: "string", pattern: "^\\d+$" } } } }
  }, handleListTemplateRuns(service, workspaceService));
}
