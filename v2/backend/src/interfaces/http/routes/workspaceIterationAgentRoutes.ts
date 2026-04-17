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
  const body = request.body as { instruction?: string; dryRun?: boolean; maxFiles?: number } | null;
  const instruction = body?.instruction?.trim();
  if (!instruction) { reply.code(400); return { message: "请输入指令内容" }; }
  try {
    return await service.quality.rewriteCodeInBoundary(iterationId, {
      instruction, dryRun: Boolean(body?.dryRun), maxFiles: typeof body?.maxFiles === "number" ? body.maxFiles : undefined,
    });
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
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
      instruction: { type: "string" }, dryRun: { type: "boolean" }, maxFiles: { type: "integer" },
    }, required: ["instruction"], additionalProperties: false } }
  }, (req, rep) => handleCodeRewrite(service, req, rep));
}
