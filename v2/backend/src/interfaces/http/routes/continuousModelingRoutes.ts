import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ContinuousModelingWorkspaceService } from "../../../application/continuousModeling/continuousModelingWorkspaceService";
import { currentUserId, parsePositiveInt } from "./workspaceRouteUtils";
import { parseIterationModelingInput } from "./continuousModelingRouteParsers";

const ID_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

function cmEnsureProjectAccess(
  service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply, projectId: number, access: "read" | "write" | "admin"
) {
  const userId = currentUserId(request);
  if (!userId) { reply.code(401); return null; }
  const context = service.getProjectAccess(userId, projectId);
  if (!context.project) { reply.code(404); return null; }
  const allowed = access === "read" ? context.canRead : access === "write" ? context.canWrite : context.canManageTenant;
  if (!allowed) { reply.code(403); return null; }
  return context;
}

function cmEnsureIterationAccess(
  service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply, iterationId: number, access: "read" | "write"
) {
  const userId = currentUserId(request);
  if (!userId) { reply.code(401); return null; }
  const context = service.getIterationAccess(userId, iterationId);
  if (!context.iteration) { reply.code(404); return null; }
  const allowed = access === "read" ? context.projectAccess.canRead : context.projectAccess.canWrite;
  if (!allowed) { reply.code(403); return null; }
  return context;
}

function validateIterationBelongsToProject(
  service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply, projectId: number, iterationId: number
) {
  const iterationAccess = cmEnsureIterationAccess(service, request, reply, iterationId, "write");
  if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
    if (reply.statusCode === 200) reply.code(iterationAccess ? 404 : reply.statusCode);
    return null;
  }
  return iterationAccess;
}

async function handleListSnapshots(service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id?: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = cmEnsureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const snapshots = service.listSnapshots(projectId);
  if (!snapshots) { reply.code(404); return { message: "项目不存在" }; }
  return snapshots;
}

async function handlePlanModeling(service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id?: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = cmEnsureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = (request.body || {}) as Record<string, unknown>;
  const parsed = parseIterationModelingInput({ ...body, projectId });
  if (!parsed) { reply.code(400); return { message: "请提供项目 ID 和迭代 ID" }; }
  if (!validateIterationBelongsToProject(service, request, reply, projectId, parsed.iterationId)) {
    return { message: "迭代不存在" };
  }
  const planned = service.planIterationModeling(parsed);
  if (!planned.ok) { reply.code(404); return { message: planned.reason === "project_not_found" ? "项目不存在" : "迭代不存在" }; }
  const plan = planned.data;
  return {
    summary: plan.summary, changedTerms: plan.changedTerms, changedEntities: plan.changedEntities,
    changedRules: plan.changedRules, blockingReviewTasks: plan.blockingReviewTasks, candidateSnapshot: plan.candidateSnapshot,
  };
}

async function handleSaveCandidate(service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id?: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = cmEnsureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = (request.body || {}) as Record<string, unknown>;
  const parsed = parseIterationModelingInput({ ...body, projectId });
  if (!parsed) { reply.code(400); return { message: "请提供项目 ID 和迭代 ID" }; }
  if (!validateIterationBelongsToProject(service, request, reply, projectId, parsed.iterationId)) {
    return { message: "迭代不存在" };
  }
  const saved = service.saveCandidate(parsed);
  if (!saved.ok) { reply.code(404); return { message: saved.reason === "project_not_found" ? "项目不存在" : "迭代不存在" }; }
  return saved.data;
}

async function handlePublishSnapshot(service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id?: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = cmEnsureProjectAccess(service, request, reply, projectId, "admin");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const snapshotId = ((request.params as { snapshotId?: string }).snapshotId || "").trim();
  if (!snapshotId) { reply.code(400); return { message: "无效的快照 ID" }; }
  const result = service.publishSnapshot(snapshotId, projectId);
  if (!result.ok) {
    const status = result.reason === "snapshot_not_candidate" ? 409 : 404;
    reply.code(status);
    const reasonMap: Record<string, string> = { project_not_found: "项目不存在", snapshot_not_found: "快照不存在", snapshot_not_candidate: "该快照不符合发布条件" };
    return { message: reasonMap[result.reason] || "操作失败" };
  }
  return result;
}

async function handleGetModelView(service: ContinuousModelingWorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id?: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = cmEnsureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const query = request.query as { iterationId?: string } | undefined;
  const iterationId = parsePositiveInt(query?.iterationId);
  if (query?.iterationId && iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  if (iterationId !== null) {
    const iterationAccess = cmEnsureIterationAccess(service, request, reply, iterationId, "read");
    if (!iterationAccess || iterationAccess.iteration?.projectId !== projectId) {
      if (reply.statusCode === 200) reply.code(iterationAccess ? 404 : reply.statusCode);
      return { message: iterationAccess ? "项目或迭代不存在" : "没有权限" };
    }
  }
  const view = service.getProjectModelView(projectId, iterationId ?? undefined);
  if (!view) { reply.code(404); return { message: iterationId ? "项目或迭代不存在" : "项目不存在" }; }
  return view;
}

export async function registerContinuousModelingRoutes(app: FastifyInstance, service: ContinuousModelingWorkspaceService) {
  app.get("/projects/:id/model-snapshots", { schema: { params: ID_PARAM_SCHEMA } },
    (req, rep) => handleListSnapshots(service, req, rep));

  app.post("/projects/:id/model-snapshots/plan", {
    schema: { params: { type: "object", properties: { id: { type: "string" } } }, body: { type: "object" } }
  }, (req, rep) => handlePlanModeling(service, req, rep));

  app.post("/projects/:id/model-snapshots/candidate", {
    schema: { params: { type: "object", properties: { id: { type: "string" } } }, body: { type: "object" } }
  }, (req, rep) => handleSaveCandidate(service, req, rep));

  app.post("/projects/:id/model-snapshots/:snapshotId/publish", {
    schema: { params: { type: "object", properties: { id: { type: "string", minLength: 1 }, snapshotId: { type: "string", minLength: 1 } } } }
  }, (req, rep) => handlePublishSnapshot(service, req, rep));

  app.get("/projects/:id/model-view", {
    schema: { params: ID_PARAM_SCHEMA, querystring: { type: "object", properties: { iterationId: { type: "string" } } } }
  }, (req, rep) => handleGetModelView(service, req, rep));
}
