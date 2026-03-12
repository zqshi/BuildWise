import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { parsePositiveInt } from "./workspaceRouteUtils";

function currentRole(authRole: string | undefined) {
  const role = authRole?.trim().toLowerCase() || "viewer";
  return role === "admin" ? "owner" : role;
}

function isAdmin(role: string) {
  return role === "owner";
}

export function registerWorkspacePolicyExecutionRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/api/projects/:id/openclaw/chat", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (!isAdmin(role)) {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "invalid project id" };
    }
    const body = request.body as { message?: string } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
    }
    try {
      return service.openclawDirectChat(projectId, message);
    } catch (error) {
      reply.code(500);
      return { message: error instanceof Error ? error.message : "openclaw chat failed" };
    }
  });

  app.get("/api/iterations/:id/policy-log", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    return service.listPolicyExecutionLogs(iterationId);
  });

  app.post("/api/iterations/:id/policy-execute", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
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
