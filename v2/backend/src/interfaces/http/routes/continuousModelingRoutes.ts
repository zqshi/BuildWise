import type { FastifyInstance } from "fastify";
import type { ContinuousModelingWorkspaceService } from "../../../application/continuousModeling/continuousModelingWorkspaceService";
import { currentUserId, parsePositiveInt } from "./workspaceRouteUtils";
import { parseIterationModelingInput } from "./continuousModelingRouteParsers";

function ensureProjectAccess(
  service: ContinuousModelingWorkspaceService,
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  projectId: number,
  access: "read" | "write" | "admin"
) {
  const userId = currentUserId(request);
  if (!userId) {
    reply.code(401);
    return null;
  }
  const context = service.getProjectAccess(userId, projectId);
  if (!context.project) {
    reply.code(404);
    return null;
  }
  const allowed = access === "read" ? context.canRead : access === "write" ? context.canWrite : context.canManageTenant;
  if (!allowed) {
    reply.code(403);
    return null;
  }
  return context;
}

function ensureIterationAccess(
  service: ContinuousModelingWorkspaceService,
  request: import("fastify").FastifyRequest,
  reply: import("fastify").FastifyReply,
  iterationId: number,
  access: "read" | "write" | "admin"
) {
  const userId = currentUserId(request);
  if (!userId) {
    reply.code(401);
    return null;
  }
  const context = service.getIterationAccess(userId, iterationId);
  if (!context.iteration) {
    reply.code(404);
    return null;
  }
  const allowed =
    access === "read" ? context.projectAccess.canRead : access === "write" ? context.projectAccess.canWrite : context.projectAccess.canManageTenant;
  if (!allowed) {
    reply.code(403);
    return null;
  }
  return context;
}

export async function registerContinuousModelingRoutes(app: FastifyInstance, service: ContinuousModelingWorkspaceService) {
  app.get("/projects/:id/model-snapshots", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } }
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const snapshots = service.listSnapshots(projectId);
    if (!snapshots) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return snapshots;
  });

  app.post("/projects/:id/model-snapshots/plan", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string" } }
      },
      body: { type: "object" }
    }
  }, async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    const body = (request.body || {}) as Record<string, unknown>;
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const parsed = parseIterationModelingInput({ ...body, projectId });
    if (!parsed) {
      reply.code(400);
      return { message: "请提供项目 ID 和迭代 ID" };
    }
    const iterationAccess = ensureIterationAccess(service, request, reply, parsed.iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) {
        reply.code(iterationAccess ? 404 : reply.statusCode);
      }
      return { message: iterationAccess ? "迭代不存在" : "没有权限" };
    }
    const planned = service.planIterationModeling(parsed);
    if (!planned.ok) {
      reply.code(planned.reason === "project_not_found" ? 404 : 404);
      return { message: planned.reason === "project_not_found" ? "项目不存在" : "迭代不存在" };
    }
    const plan = planned.data;
    return {
      summary: plan.summary,
      changedTerms: plan.changedTerms,
      changedEntities: plan.changedEntities,
      changedRules: plan.changedRules,
      blockingReviewTasks: plan.blockingReviewTasks,
      candidateSnapshot: plan.candidateSnapshot
    };
  });

  app.post("/projects/:id/model-snapshots/candidate", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string" } }
      },
      body: { type: "object" }
    }
  }, async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    const body = (request.body || {}) as Record<string, unknown>;
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const parsed = parseIterationModelingInput({ ...body, projectId });
    if (!parsed) {
      reply.code(400);
      return { message: "请提供项目 ID 和迭代 ID" };
    }
    const iterationAccess = ensureIterationAccess(service, request, reply, parsed.iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) {
        reply.code(iterationAccess ? 404 : reply.statusCode);
      }
      return { message: iterationAccess ? "迭代不存在" : "没有权限" };
    }
    const saved = service.saveCandidate(parsed);
    if (!saved.ok) {
      reply.code(saved.reason === "project_not_found" ? 404 : 404);
      return { message: saved.reason === "project_not_found" ? "项目不存在" : "迭代不存在" };
    }
    return saved.data;
  });

  app.post("/projects/:id/model-snapshots/:snapshotId/publish", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          snapshotId: { type: "string", minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id?: string; snapshotId?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const snapshotId = (params.snapshotId || "").trim();
    if (!snapshotId) {
      reply.code(400);
      return { message: "无效的快照 ID" };
    }
    const result = service.publishSnapshot(snapshotId, projectId);
    if (!result.ok) {
      const status = result.reason === "project_not_found" ? 404 : result.reason === "snapshot_not_found" ? 404 : 409;
      reply.code(status);
      const reasonMap: Record<string, string> = { project_not_found: "项目不存在", snapshot_not_found: "快照不存在", snapshot_not_candidate: "该快照不符合发布条件" };
      return { message: reasonMap[result.reason] || "操作失败" };
    }
    return result;
  });

  app.get("/projects/:id/model-view", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } }
      },
      querystring: {
        type: "object",
        properties: { iterationId: { type: "string" } }
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id?: string };
    const query = request.query as { iterationId?: string } | undefined;
    const projectId = parsePositiveInt(params.id);
    const iterationId = parsePositiveInt(query?.iterationId);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    if (query?.iterationId && iterationId === null) {
      reply.code(400);
      return { message: "无效的迭代 ID" };
    }
    if (iterationId !== null) {
      const iterationAccess = ensureIterationAccess(service, request, reply, iterationId, "read");
      if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
        if (reply.statusCode === 200) {
          reply.code(iterationAccess ? 404 : reply.statusCode);
        }
        return { message: iterationAccess ? "项目或迭代不存在" : "没有权限" };
      }
    }
    const view = service.getProjectModelView(projectId, iterationId ?? undefined);
    if (!view) {
      reply.code(404);
      return { message: iterationId ? "项目或迭代不存在" : "项目不存在" };
    }
    return view;
  });
}
