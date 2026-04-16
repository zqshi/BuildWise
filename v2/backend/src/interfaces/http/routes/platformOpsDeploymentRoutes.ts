import type { FastifyInstance } from "fastify";
import type { PlatformService } from "../../../application/platform/platformService";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";
import type { EnsurePermission } from "./platformRoutes";

export function registerOpsDeploymentRoutes(
  app: FastifyInstance,
  service: PlatformService,
  workspaceService: WorkspaceService,
  ensurePermission: EnsurePermission
) {
  app.get("/ops/deployments", {
    schema: {
      querystring: {
        type: "object",
        properties: { projectId: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const query = request.query as { projectId?: string } | null;
    const projectId = parsePositiveInt(query?.projectId ?? "");
    if (projectId === null) {
      reply.code(400);
      return { message: "请提供项目 ID" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    return service.listDeployments(projectId);
  });

  app.post("/ops/deployments", {
    schema: {
      body: {
        type: "object",
        properties: {
          projectId: { type: "integer" },
          iterationId: { type: "integer" },
          environment: { type: "string", enum: ["staging", "production"] },
          version: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "deploy:write", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const body = request.body as {
      projectId?: number;
      iterationId?: number;
      environment?: "staging" | "production";
      version?: string;
    } | null;
    const projectId = typeof body?.projectId === "number" ? body.projectId : null;
    const iterationId = typeof body?.iterationId === "number" ? body.iterationId : undefined;
    const environment = body?.environment;
    const version = body?.version?.trim();
    if (!projectId || !environment || !version) {
      reply.code(400);
      return { message: "请提供项目 ID、环境和版本" };
    }
    const projectAccess = ensureProjectAccess(workspaceService, request, reply, projectId, "write");
    if (!projectAccess) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    if (typeof iterationId === "number") {
      const iterationAccess = ensureIterationAccess(workspaceService, request, reply, iterationId, "write");
      if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
        if (reply.statusCode === 200) {
          reply.code(iterationAccess ? 404 : reply.statusCode);
        }
        return { message: iterationAccess ? "项目或迭代不存在" : "没有权限" };
      }
    }
    if (!["staging", "production"].includes(environment)) {
      reply.code(400);
      return { message: "无效的部署环境" };
    }
    const created = service.createDeployment(projectId, environment, version, iterationId);
    if (!created.ok) {
      if (created.reason === "project_not_found" || created.reason === "iteration_not_found") {
        reply.code(404);
        return { message: created.reason === "project_not_found" ? "项目不存在" : "迭代不存在" };
      }
      if (created.reason === "release_gate_blocked") {
        reply.code(409);
        return { message: created.message || "发布门禁未通过", blockers: created.blockers || [] };
      }
      reply.code(404);
      return { message: "项目不存在" };
    }
    return created.data;
  });

  app.post("/ops/deployments/:id/transition", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } }
      },
      body: {
        type: "object",
        properties: {
          toStatus: { type: "string", enum: ["running", "success", "failed"] }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const permit = ensurePermission(request.authRole, "deploy:transition", workspaceService);
    if (!permit.ok) {
      reply.code(403);
      return { message: "没有权限" };
    }
    const params = request.params as { id: string };
    const body = request.body as { toStatus?: "running" | "success" | "failed" } | null;
    const deploymentId = parsePositiveInt(params.id);
    if (!deploymentId || !body?.toStatus) {
      reply.code(400);
      return { message: "请提供部署 ID 和目标状态" };
    }
    const deployment = service.getDeployment(deploymentId);
    if (!deployment) {
      reply.code(404);
      return { message: "部署记录不存在" };
    }
    const access = ensureProjectAccess(workspaceService, request, reply, deployment.projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const result = service.transitionDeployment(deploymentId, body.toStatus);
    if (!result.ok) {
      if (result.reason === "deployment_not_found") {
        reply.code(404);
        return { message: "部署记录不存在" };
      }
      reply.code(409);
      return { message: "无效的部署状态转换" };
    }
    return result.data;
  });
}
