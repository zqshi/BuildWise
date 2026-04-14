import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspacePolicyExecutionRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/policy-log", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
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
    return service.governance.listPolicyExecutionLogs(iterationId);
  });

  app.post("/iterations/:id/policy-execute", {
    schema: {
      params: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^\\d+$" }
        },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          action: { type: "string" },
          message: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
    const body = request.body as { action?: string; message?: string } | null;
    const action = body?.action?.trim() || "manual-step";
    const message = body?.message?.trim() || action;
    const gate = service.governance.evaluatePolicyGateForCoach(iterationId, message);
    if (!gate) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    const context = service.iteration.getIterationContext(iterationId);
    if (!context?.iteration) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    const activePolicy = service.governance.getEffectiveOrchestrationPolicy(context.iteration.projectId);
    if (!activePolicy) {
      reply.code(400);
      return { message: "effective policy not found" };
    }
    const log = service.governance.appendPolicyExecutionLog({
      projectId: context.iteration.projectId,
      iterationId,
      policyVersion: activePolicy.version,
      stage: gate.stage,
      action,
      result: gate.blocked ? "blocked" : "success",
      evidence: gate.blocked ? [gate.reason] : [`message=${message.slice(0, 200)}`]
    });
    return {
      ok: !gate.blocked,
      gate,
      policyVersion: activePolicy.version,
      log
    };
  });
}
