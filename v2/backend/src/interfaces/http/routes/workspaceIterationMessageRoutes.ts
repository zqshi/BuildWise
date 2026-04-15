import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerIterationMessageRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/messages", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, querystring: { type: "object" as const, properties: { limit: { type: "string" as const }, offset: { type: "string" as const } } } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { limit?: string; offset?: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "无效的迭代 ID" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    }
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const offset = query.offset ? parseInt(query.offset, 10) : undefined;
    return service.iteration.listMessages(iterationId, { limit, offset });
  });

  app.post("/iterations/:id/messages", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { role: { type: "string" as const }, content: { type: "string" as const } }, required: ["content" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const body = request.body as { role?: string; content?: string } | null;
    const content = body?.content?.trim();
    if (!content) {
      reply.code(400);
      return { message: "内容不能为空" };
    }
    const messageRole = body?.role === "assistant" ? "assistant" : body?.role === "system" ? "system" : "user";
    const added = service.iteration.createMessage(iterationId, messageRole, content);
    if (!added) {
      reply.code(404);
      return { message: "迭代不存在" };
    }
    return added;
  });

  app.post("/iterations/:id/interaction-state", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { hasPrototypeAssets: { type: "boolean" as const }, uploadKind: { type: "string" as const, enum: ["documents", "prototype", "mixed", "other"] }, lastAttachmentName: { type: "string" as const } }, required: ["hasPrototypeAssets" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const body = request.body as {
      hasPrototypeAssets?: boolean;
      uploadKind?: "documents" | "prototype" | "mixed" | "other";
      lastAttachmentName?: string;
    } | null;
    const updated = service.iteration.updateIterationInteractionState(iterationId, {
      hasPrototypeAssets: Boolean(body?.hasPrototypeAssets),
      uploadKind: body?.uploadKind || "documents",
      lastAttachmentName: body?.lastAttachmentName?.trim() || ""
    });
    if (!updated) {
      reply.code(404);
      return { message: "迭代不存在" };
    }
    return updated;
  });
}
