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
  app.get("/projects/:id/model-snapshots", async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const snapshots = service.listSnapshots(projectId);
    if (!snapshots) {
      reply.code(404);
      return { message: "project not found" };
    }
    return snapshots;
  });

  app.post("/projects/:id/model-snapshots/plan", async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    const body = (request.body || {}) as Record<string, unknown>;
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const parsed = parseIterationModelingInput({ ...body, projectId });
    if (!parsed) {
      reply.code(400);
      return { message: "projectId and iterationId are required" };
    }
    const iterationAccess = ensureIterationAccess(service, request, reply, parsed.iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) {
        reply.code(iterationAccess ? 404 : reply.statusCode);
      }
      return { message: iterationAccess ? "iteration not found" : "permission denied" };
    }
    const planned = service.planIterationModeling(parsed);
    if (!planned.ok) {
      reply.code(planned.reason === "project_not_found" ? 404 : 404);
      return { message: planned.reason === "project_not_found" ? "project not found" : "iteration not found" };
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

  app.post("/projects/:id/model-snapshots/candidate", async (request, reply) => {
    const params = request.params as { id?: string };
    const projectId = parsePositiveInt(params.id);
    const body = (request.body || {}) as Record<string, unknown>;
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const parsed = parseIterationModelingInput({ ...body, projectId });
    if (!parsed) {
      reply.code(400);
      return { message: "projectId and iterationId are required" };
    }
    const iterationAccess = ensureIterationAccess(service, request, reply, parsed.iterationId, "write");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) {
        reply.code(iterationAccess ? 404 : reply.statusCode);
      }
      return { message: iterationAccess ? "iteration not found" : "permission denied" };
    }
    const saved = service.saveCandidate(parsed);
    if (!saved.ok) {
      reply.code(saved.reason === "project_not_found" ? 404 : 404);
      return { message: saved.reason === "project_not_found" ? "project not found" : "iteration not found" };
    }
    return saved.data;
  });

  app.post("/projects/:id/model-snapshots/:snapshotId/publish", async (request, reply) => {
    const params = request.params as { id?: string; snapshotId?: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const snapshotId = (params.snapshotId || "").trim();
    if (!snapshotId) {
      reply.code(400);
      return { message: "invalid snapshot id" };
    }
    const result = service.publishSnapshot(snapshotId, projectId);
    if (!result.ok) {
      const status = result.reason === "project_not_found" ? 404 : result.reason === "snapshot_not_found" ? 404 : 409;
      reply.code(status);
      return { message: result.reason };
    }
    return result;
  });

  app.get("/projects/:id/model-view", async (request, reply) => {
    const params = request.params as { id?: string };
    const query = request.query as { iterationId?: string } | undefined;
    const projectId = parsePositiveInt(params.id);
    const iterationId = parsePositiveInt(query?.iterationId);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    if (query?.iterationId && iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    if (iterationId !== null) {
      const iterationAccess = ensureIterationAccess(service, request, reply, iterationId, "read");
      if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
        if (reply.statusCode === 200) {
          reply.code(iterationAccess ? 404 : reply.statusCode);
        }
        return { message: iterationAccess ? "project or iteration not found" : "permission denied" };
      }
    }
    const view = service.getProjectModelView(projectId, iterationId ?? undefined);
    if (!view) {
      reply.code(404);
      return { message: iterationId ? "project or iteration not found" : "project not found" };
    }
    return view;
  });
}
