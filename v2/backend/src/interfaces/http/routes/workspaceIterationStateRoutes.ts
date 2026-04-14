import type { FastifyInstance } from "fastify";
import { hasPermission } from "../../../application/platform/platformSupport";
import { isIterationStatus } from '../../../application/workspace/shared/workspaceSupport';
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspaceIterationStateRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/context", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const context = service.iteration.getIterationContext(iterationId);
    if (!context) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return context;
  });

  app.get("/iterations/:id/state-machine", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const stateMachine = service.iteration.getStateMachine(iterationId);
    if (!stateMachine) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return stateMachine;
  });

  app.post("/iterations/:id/state/transition", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { toStatus: { type: "string" as const }, reason: { type: "string" as const } }, required: ["toStatus" as const], additionalProperties: false } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const role = access.projectAccess.workspaceRole;
    const grantedPermissions = service.governance.resolveRolePermissions(role);
    if (!hasPermission(role, "iteration:transition", grantedPermissions)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { toStatus?: string; reason?: string } | null;
    const toStatus = body?.toStatus?.trim();
    if (!toStatus) {
      reply.code(400);
      return { message: "toStatus is required" };
    }
    if (!isIterationStatus(toStatus)) {
      reply.code(400);
      return { message: "invalid toStatus" };
    }
    if (toStatus === "completed" && !hasPermission(role, "iteration:transition:complete", grantedPermissions)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const reason = body?.reason?.trim() || "状态转换";
    const transition = service.iteration.transitionIteration(
      iterationId,
      toStatus,
      {
        source: "manual",
        reason,
        operator: request.authSub ? `user:${request.authSub}` : `user:${role}`,
        operatorRole: role
      }
    );
    if (!transition.ok) {
      if (transition.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      if (transition.reason === "reason_required" || transition.reason === "reason_too_short") {
        reply.code(400);
        return { message: transition.reason === "reason_required" ? "reason is required" : "reason must be at least 10 characters for manual transition" };
      }
      if (transition.reason === "invalid_transition") {
        reply.code(409);
        return { message: "invalid transition" };
      }
      reply.code(400);
      return { message: "transition failed" };
    }
    return transition.data;
  });

  app.get("/iterations/:id/assessment", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const result = service.iteration.getAssessment(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.get("/iterations/:id/assessment/history", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    return service.iteration.listAssessmentSnapshots(iterationId);
  });

  app.post("/iterations/:id/assessment/recompute", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const result = service.iteration.recomputeAssessment(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/assessment/restore/:snapshotId", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, snapshotId: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const, "snapshotId" as const] } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string; snapshotId: string };
    const iterationId = parsePositiveInt(params.id);
    const snapshotId = parsePositiveInt(params.snapshotId);
    if (iterationId === null || snapshotId === null) {
      reply.code(400);
      return { message: "invalid iteration id or snapshot id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const result = service.iteration.restoreSnapshot(iterationId, snapshotId);
    if (!result) {
      reply.code(404);
      return { message: "iteration or snapshot not found" };
    }
    return result;
  });
}
