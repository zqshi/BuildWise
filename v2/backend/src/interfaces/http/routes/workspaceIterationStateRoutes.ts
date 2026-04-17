import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasPermission } from "../../../application/platform/platformSupport";
import { isIterationStatus } from '../../../application/workspace/shared/workspaceSupport';
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

type IdParams = { id: string };

function resolveIterId(request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as IdParams).id);
  if (iterationId === null) reply.code(400);
  return iterationId;
}

async function handleGetContext(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterId(request, reply);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const context = service.iteration.getIterationContext(iterationId);
  if (!context) { reply.code(404); return { message: "迭代不存在" }; }
  return context;
}

async function handleGetStateMachine(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterId(request, reply);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const stateMachine = service.iteration.getStateMachine(iterationId);
  if (!stateMachine) { reply.code(404); return { message: "迭代不存在" }; }
  return stateMachine;
}

async function handleStateTransition(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterId(request, reply);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const role = access.projectAccess.workspaceRole;
  const grantedPermissions = service.governance.resolveRolePermissions(role);
  if (!hasPermission(role, "iteration:transition", grantedPermissions)) { reply.code(403); return { message: "没有权限" }; }
  const body = request.body as { toStatus?: string; reason?: string } | null;
  const toStatus = body?.toStatus?.trim();
  if (!toStatus) { reply.code(400); return { message: "请指定目标状态" }; }
  if (!isIterationStatus(toStatus)) { reply.code(400); return { message: "无效的目标状态" }; }
  if (toStatus === "completed" && !hasPermission(role, "iteration:transition:complete", grantedPermissions)) {
    reply.code(403); return { message: "没有权限" };
  }
  const reason = body?.reason?.trim() || "状态转换";
  const transition = service.iteration.transitionIteration(iterationId, toStatus, {
    source: "manual", reason, operator: request.authSub ? `user:${request.authSub}` : `user:${role}`, operatorRole: role,
  });
  if (!transition.ok) return resolveTransitionError(reply, transition);
  return transition.data;
}

function resolveTransitionError(reply: FastifyReply, result: { ok: false; reason: string }) {
  if (result.reason === "iteration_not_found") { reply.code(404); return { message: "迭代不存在" }; }
  if (result.reason === "reason_required") { reply.code(400); return { message: "请填写转换原因" }; }
  if (result.reason === "reason_too_short") { reply.code(400); return { message: "转换原因至少需要 10 个字符" }; }
  if (result.reason === "invalid_transition") { reply.code(409); return { message: "不允许的状态转换" }; }
  reply.code(400); return { message: "状态转换失败" };
}

async function handleGetAssessment(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterId(request, reply);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const result = service.iteration.getAssessment(iterationId);
  if (!result) { reply.code(404); return { message: "迭代不存在" }; }
  return result;
}

async function handleGetAssessmentHistory(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterId(request, reply);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  return service.iteration.listAssessmentSnapshots(iterationId);
}

async function handleRecomputeAssessment(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = resolveIterId(request, reply);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const result = service.iteration.recomputeAssessment(iterationId);
  if (!result) { reply.code(404); return { message: "迭代不存在" }; }
  return result;
}

async function handleRestoreSnapshot(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const params = request.params as { id: string; snapshotId: string };
  const iterationId = parsePositiveInt(params.id);
  const snapshotId = parsePositiveInt(params.snapshotId);
  if (iterationId === null || snapshotId === null) { reply.code(400); return { message: "无效的迭代或快照" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const result = service.iteration.restoreSnapshot(iterationId, snapshotId);
  if (!result) { reply.code(404); return { message: "迭代或快照不存在" }; }
  return result;
}

const SNAPSHOT_PARAM_SCHEMA = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" }, snapshotId: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id" as const, "snapshotId" as const]
};

export function registerWorkspaceIterationStateRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/context", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetContext(service, req, rep));

  app.get("/iterations/:id/state-machine", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetStateMachine(service, req, rep));

  app.post("/iterations/:id/state/transition", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      toStatus: { type: "string" }, reason: { type: "string" },
    }, required: ["toStatus"], additionalProperties: false } }
  }, (req, rep) => handleStateTransition(service, req, rep));

  app.get("/iterations/:id/assessment", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetAssessment(service, req, rep));

  app.get("/iterations/:id/assessment/history", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetAssessmentHistory(service, req, rep));

  app.post("/iterations/:id/assessment/recompute", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleRecomputeAssessment(service, req, rep));

  app.post("/iterations/:id/assessment/restore/:snapshotId", { schema: { params: SNAPSHOT_PARAM_SCHEMA } },
    (req, rep) => handleRestoreSnapshot(service, req, rep));
}
