import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, parsePositiveInt } from "./workspaceRouteUtils";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

async function handleListMessages(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const query = request.query as { limit?: string; offset?: string };
  const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
  const offset = query.offset ? Number.parseInt(query.offset, 10) : undefined;
  return service.iteration.listMessages(iterationId, { limit, offset });
}

async function handleCreateMessage(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { role?: string; content?: string } | null;
  const content = body?.content?.trim();
  if (!content) { reply.code(400); return { message: "内容不能为空" }; }
  const messageRole = body?.role === "assistant" ? "assistant" : body?.role === "system" ? "system" : "user";
  const added = service.iteration.createMessage(iterationId, messageRole, content);
  if (!added) { reply.code(404); return { message: "迭代不存在" }; }
  return added;
}

async function handleUpdateInteractionState(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { hasPrototypeAssets?: boolean; uploadKind?: "documents" | "prototype" | "mixed" | "other"; lastAttachmentName?: string } | null;
  const updated = service.iteration.updateIterationInteractionState(iterationId, {
    hasPrototypeAssets: Boolean(body?.hasPrototypeAssets), uploadKind: body?.uploadKind || "documents",
    lastAttachmentName: body?.lastAttachmentName?.trim() || "",
  });
  if (!updated) { reply.code(404); return { message: "迭代不存在" }; }
  return updated;
}

export function registerIterationMessageRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/messages", {
    schema: { params: ITER_PARAM_SCHEMA, querystring: { type: "object", properties: { limit: { type: "string" }, offset: { type: "string" } } } }
  }, (req, rep) => handleListMessages(service, req, rep));

  app.post("/iterations/:id/messages", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      role: { type: "string" }, content: { type: "string" },
    }, required: ["content"], additionalProperties: false } }
  }, (req, rep) => handleCreateMessage(service, req, rep));

  app.post("/iterations/:id/interaction-state", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      hasPrototypeAssets: { type: "boolean" }, uploadKind: { type: "string", enum: ["documents", "prototype", "mixed", "other"] },
      lastAttachmentName: { type: "string" },
    }, required: ["hasPrototypeAssets"], additionalProperties: false } }
  }, (req, rep) => handleUpdateInteractionState(service, req, rep));
}
