import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

async function handleGetPolicyLog(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  return service.governance.listPolicyExecutionLogs(iterationId);
}

async function handlePolicyExecute(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { action?: string; message?: string } | null;
  const action = body?.action?.trim() || "manual-step";
  const message = body?.message?.trim() || action;
  const gate = service.governance.evaluatePolicyGateForCoach(iterationId, message);
  if (!gate) { reply.code(404); return { message: "迭代不存在" }; }
  const context = service.iteration.getIterationContext(iterationId);
  if (!context?.iteration) { reply.code(404); return { message: "迭代不存在" }; }
  const activePolicy = service.governance.getEffectiveOrchestrationPolicy(context.iteration.projectId);
  if (!activePolicy) { reply.code(400); return { message: "未找到有效策略" }; }
  const log = service.governance.appendPolicyExecutionLog({
    projectId: context.iteration.projectId, iterationId, policyVersion: activePolicy.version,
    stage: gate.stage, action, result: gate.blocked ? "blocked" : "success",
    evidence: gate.blocked ? [gate.reason] : [`用户操作：${message.slice(0, 200)}`],
  });
  return { ok: !gate.blocked, gate, policyVersion: activePolicy.version, log };
}

export function registerWorkspacePolicyExecutionRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/policy-log", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetPolicyLog(service, req, rep));

  app.post("/iterations/:id/policy-execute", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      action: { type: "string" }, message: { type: "string" },
    }, additionalProperties: false } }
  }, (req, rep) => handlePolicyExecute(service, req, rep));
}
