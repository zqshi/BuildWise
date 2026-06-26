import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

function resolveWriteIteration(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return null; }
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return null; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return null;
  return iterationId;
}

async function handleAgentChat(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveWriteIteration(service, request, reply);
  if (!iterationId) return { message: reply.statusCode === 404 ? "迭代不存在" : (reply.statusCode === 400 ? "无效的迭代 ID" : "没有权限") };
  const message = ((request.body as { message?: string } | null)?.message || "").trim();
  if (!message) { reply.code(400); return { message: "请输入消息内容" }; }
  try {
    return await service.coachIterationConversation(iterationId, message);
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
}

async function handleVisualEdit(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveWriteIteration(service, request, reply);
  if (!iterationId) return { message: reply.statusCode === 404 ? "迭代不存在" : (reply.statusCode === 400 ? "无效的迭代 ID" : "没有权限") };
  const body = request.body as { message?: string; target?: Record<string, unknown> } | null;
  const message = body?.message?.trim();
  if (!message) { reply.code(400); return { message: "请输入消息内容" }; }
  try {
    return await service.quality.executeVisualEditInstruction(iterationId, message, body?.target);
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
}

async function handleCodeRewrite(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveWriteIteration(service, request, reply);
  if (!iterationId) return { message: reply.statusCode === 404 ? "迭代不存在" : (reply.statusCode === 400 ? "无效的迭代 ID" : "没有权限") };
  const body = request.body as { instruction?: string; dryRun?: boolean; maxFiles?: number; role?: "delivery-engineer" | "frontend-developer" | "backend-developer" } | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) { reply.code(400); return { message: "请输入指令内容" }; }
  const dryRun = Boolean(body?.dryRun);
  const maxFiles = typeof body?.maxFiles === "number" ? body.maxFiles : undefined;
  const role = body?.role;
  // 非 dryRun 时优先走编码 agent 异步 job（真实改代码 + 事后边界校验）；dryRun 或无 registry 走同步 LLM fallback
  if (!dryRun) {
    const jobId = service.quality.startCodeRewriteJob(iterationId, { instruction, maxFiles, role });
    if (jobId) return { jobId, status: "pending" as const };
  }
  try {
    return await service.quality.rewriteCodeInBoundary(iterationId, {
      instruction, dryRun, maxFiles, role,
    });
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
}

function handleCodeRewriteJobStatus(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveWriteIteration(service, request, reply);
  if (!iterationId) return { message: reply.statusCode === 404 ? "迭代不存在" : (reply.statusCode === 400 ? "无效的迭代 ID" : "没有权限") };
  const params = request.params as { jobId?: string };
  const jobId = (params?.jobId || "").trim();
  if (!jobId) { reply.code(400); return { message: "无效的任务 ID" }; }
  const job = service.quality.getCodeRewriteJob(jobId);
  if (!job) { reply.code(404); return { message: "代码改写任务不存在" }; }
  if (job.iterationId !== iterationId) { reply.code(403); return { message: "没有权限" }; }
  return job;
}

export function registerIterationAgentRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/agent-chat", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: { message: { type: "string", minLength: 1 } }, required: ["message"], additionalProperties: false } }
  }, (req, rep) => handleAgentChat(service, req, rep));

  app.post("/iterations/:id/visual-edit/execute", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: { message: { type: "string" }, target: { type: "object" } }, required: ["message"], additionalProperties: false } }
  }, (req, rep) => handleVisualEdit(service, req, rep));

  app.post("/iterations/:id/code-rewrite", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      instruction: { type: "string" }, dryRun: { type: "boolean" }, maxFiles: { type: "integer" }, role: { type: "string", enum: ["delivery-engineer", "frontend-developer", "backend-developer"] },
    }, required: ["instruction"], additionalProperties: false } }
  }, (req, rep) => handleCodeRewrite(service, req, rep));

  app.get("/iterations/:id/code-rewrite/:jobId", {
    schema: { params: { type: "object", properties: { id: { type: "string" }, jobId: { type: "string", minLength: 1 } }, required: ["id", "jobId"] } }
  }, (req, rep) => handleCodeRewriteJobStatus(service, req, rep));
}
