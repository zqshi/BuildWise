import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";

export function registerIterationAgentRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/agent-chat", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { message: { type: "string" as const, minLength: 1 } }, required: ["message" as const], additionalProperties: false } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "没有权限" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "无效的迭代 ID" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    }
    const body = request.body as { message?: string } | null;
    const message = body?.message?.trim();
    if (!message) {
      reply.code(400);
      return { message: "请输入消息内容" };
    }
    let result;
    try {
      result = await service.coachIterationConversation(iterationId, message);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    return result;
  });

  app.post("/iterations/:id/visual-edit/execute", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { message: { type: "string" as const }, target: { type: "object" as const } }, required: ["message" as const], additionalProperties: false } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "没有权限" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "无效的迭代 ID" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    }
    const body = request.body as { message?: string; target?: Record<string, unknown> } | null;
    const message = body?.message?.trim();
    if (!message) {
      reply.code(400);
      return { message: "请输入消息内容" };
    }
    let result;
    try {
      result = await service.quality.executeVisualEditInstruction(iterationId, message, body?.target);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    return result;
  });

  app.post("/iterations/:id/code-rewrite", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { instruction: { type: "string" as const }, dryRun: { type: "boolean" as const }, maxFiles: { type: "integer" as const } }, required: ["instruction" as const], additionalProperties: false } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "没有权限" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "无效的迭代 ID" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    }
    const body = request.body as { instruction?: string; dryRun?: boolean; maxFiles?: number } | null;
    const instruction = body?.instruction?.trim();
    if (!instruction) {
      reply.code(400);
      return { message: "请输入指令内容" };
    }
    let result;
    try {
      result = await service.quality.rewriteCodeInBoundary(iterationId, {
        instruction,
        dryRun: Boolean(body?.dryRun),
        maxFiles: typeof body?.maxFiles === "number" ? body.maxFiles : undefined
      });
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    return result;
  });
}
