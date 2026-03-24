import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { ensureIterationAccess, ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerWorkspacePolicyExecutionRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/projects/:id/openclaw/chat", async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "admin");
    if (!access) {
      return { message: reply.statusCode === 404 ? "project not found" : "permission denied" };
    }
    const body = request.body as { message?: string } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
    }
    try {
      return await service.openclawDirectChat(projectId, message);
    } catch (error) {
      reply.code(500);
      return { message: "Internal server error" };
    }
  });

  app.get("/iterations/:id/policy-log", async (request, reply) => {
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
    return service.listPolicyExecutionLogs(iterationId);
  });

  app.post("/iterations/:id/policy-execute", async (request, reply) => {
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
    const gate = service.evaluatePolicyGateForCoach(iterationId, message);
    if (!gate) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    const context = service.getIterationContext(iterationId);
    if (!context?.iteration) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    const activePolicy = service.getEffectiveOrchestrationPolicy(context.iteration.projectId);
    if (!activePolicy) {
      reply.code(400);
      return { message: "effective policy not found" };
    }
    const log = service.appendPolicyExecutionLog({
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
