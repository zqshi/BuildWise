import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

async function handleListDeployments(service: PlatformService, ws: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { projectId?: string } | null;
  const projectId = parsePositiveInt(query?.projectId ?? "");
  if (projectId === null) { reply.code(400); return { message: "请提供项目 ID" }; }
  const access = ensureProjectAccess(ws, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  return service.listDeployments(projectId);
}

async function handleCreateDeployment(
  service: PlatformService, ws: WorkspaceService, request: FastifyRequest, reply: FastifyReply, ensurePermission: EnsurePermission
) {
  const permit = ensurePermission(request.authRole, "deploy:write", ws);
  if (!permit.ok) { reply.code(403); return { message: "没有权限" }; }
  const body = request.body as {
    projectId?: number; iterationId?: number; environment?: "staging" | "production"; version?: string;
  } | null;
  const projectId = typeof body?.projectId === "number" ? body.projectId : null;
  const iterationId = typeof body?.iterationId === "number" ? body.iterationId : undefined;
  const environment = body?.environment;
  const version = body?.version?.trim();
  if (!projectId || !environment || !version) { reply.code(400); return { message: "请提供项目 ID、环境和版本" }; }
  const projectAccess = ensureProjectAccess(ws, request, reply, projectId, "write");
  if (!projectAccess) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  if (typeof iterationId === "number") {
    const iterationAccess = ensureIterationAccess(ws, request, reply, iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) reply.code(iterationAccess ? 404 : reply.statusCode);
      return { message: iterationAccess ? "项目或迭代不存在" : "没有权限" };
    }
  }
  if (!["staging", "production"].includes(environment)) { reply.code(400); return { message: "无效的部署环境" }; }
  const created = service.createDeployment(projectId, environment, version, iterationId);
  if (!created.ok) return resolveDeployError(reply, created);
  return created.data;
}

function resolveDeployError(reply: FastifyReply, result: { ok: false; reason: string; message?: string; blockers?: unknown }) {
  if (result.reason === "project_not_found") { reply.code(404); return { message: "项目不存在" }; }
  if (result.reason === "iteration_not_found") { reply.code(404); return { message: "迭代不存在" }; }
  if (result.reason === "release_gate_blocked") {
    reply.code(409); return { message: result.message || "发布门禁未通过", blockers: result.blockers || [] };
  }
  reply.code(404); return { message: "项目不存在" };
}

async function handleTransitionDeployment(
  service: PlatformService, ws: WorkspaceService, request: FastifyRequest, reply: FastifyReply, ensurePermission: EnsurePermission
) {
  const permit = ensurePermission(request.authRole, "deploy:transition", ws);
  if (!permit.ok) { reply.code(403); return { message: "没有权限" }; }
  const deploymentId = parsePositiveInt((request.params as { id: string }).id);
  const toStatus = (request.body as { toStatus?: string } | null)?.toStatus;
  if (!deploymentId || !toStatus) { reply.code(400); return { message: "请提供部署 ID 和目标状态" }; }
  const deployment = service.getDeployment(deploymentId);
  if (!deployment) { reply.code(404); return { message: "部署记录不存在" }; }
  const access = ensureProjectAccess(ws, request, reply, deployment.projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const result = service.transitionDeployment(deploymentId, toStatus as "running" | "success" | "failed");
  if (!result.ok) {
    if (result.reason === "deployment_not_found") { reply.code(404); return { message: "部署记录不存在" }; }
    reply.code(409); return { message: "无效的部署状态转换" };
  }
  return result.data;
}

export function registerOpsDeploymentRoutes(
  app: FastifyInstance, service: PlatformService, workspaceService: WorkspaceService, ensurePermission: EnsurePermission
) {
  app.get("/ops/deployments", {
    schema: { querystring: { type: "object", properties: { projectId: { type: "string", pattern: "^\\d+$" } } } }
  }, (req, rep) => handleListDeployments(service, workspaceService, req, rep));

  app.post("/ops/deployments", {
    schema: { body: { type: "object", properties: {
      projectId: { type: "integer" }, iterationId: { type: "integer" },
      environment: { type: "string", enum: ["staging", "production"] }, version: { type: "string" },
    }, additionalProperties: false } }
  }, (req, rep) => handleCreateDeployment(service, workspaceService, req, rep, ensurePermission));

  app.post("/ops/deployments/:id/transition", {
    schema: { params: { type: "object", properties: { id: { type: "string", pattern: "^\\d+$" } } },
      body: { type: "object", properties: { toStatus: { type: "string", enum: ["running", "success", "failed"] } }, additionalProperties: false } }
  }, (req, rep) => handleTransitionDeployment(service, workspaceService, req, rep, ensurePermission));
}
