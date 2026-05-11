import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureProjectAccess, parsePositiveInt, currentUserId } from "./workspaceRouteUtils";
import {
  ALLOWED_BACKLOG_PRIORITIES,
  ALLOWED_BACKLOG_STATUSES,
  ALLOWED_BACKLOG_SOURCES
} from "../../../domain/workspace/backlogTypes";
import type { BacklogItemFilter } from "../../../domain/workspace/backlogTypes";

const ID_PARAM = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id"] as const };
const ID_ITEM_PARAM = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, itemId: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id", "itemId"] as const };

async function handleListBacklog(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const query = request.query as Record<string, string | undefined>;
  const filter: BacklogItemFilter = {};
  if (query.status && ALLOWED_BACKLOG_STATUSES.has(query.status)) filter.status = query.status as BacklogItemFilter["status"];
  if (query.priority && ALLOWED_BACKLOG_PRIORITIES.has(query.priority)) filter.priority = query.priority as BacklogItemFilter["priority"];
  if (query.source && ALLOWED_BACKLOG_SOURCES.has(query.source)) filter.source = query.source as BacklogItemFilter["source"];
  if (query.iterationId !== undefined) filter.iterationId = query.iterationId === "null" ? null : parsePositiveInt(query.iterationId);
  return service.backlog.listBacklogItems(projectId, filter);
}

async function handleCreateBacklog(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = request.body as { title?: string; description?: string; priority?: string; source?: string; sourceRef?: string; tags?: string[]; iterationId?: number | null } | null;
  const title = body?.title?.trim();
  if (!title) { reply.code(400); return { message: "标题不能为空" }; }
  const actor = currentUserId(request) || "system";
  const item = service.backlog.createBacklogItem(projectId, {
    title,
    description: body?.description?.trim(),
    priority: body?.priority && ALLOWED_BACKLOG_PRIORITIES.has(body.priority) ? body.priority as "critical" | "high" | "medium" | "low" : undefined,
    source: body?.source && ALLOWED_BACKLOG_SOURCES.has(body.source) ? body.source as "customer" | "internal" | "analysis" | "coach" : undefined,
    sourceRef: body?.sourceRef,
    tags: Array.isArray(body?.tags) ? body.tags : undefined,
    iterationId: body?.iterationId ?? undefined
  }, actor);
  if (!item) { reply.code(404); return { message: "项目不存在或迭代无效" }; }
  reply.code(201);
  return item;
}

async function handleGetBacklogItem(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; itemId: string };
  const projectId = parsePositiveInt(params.id);
  const itemId = parsePositiveInt(params.itemId);
  if (projectId === null || itemId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const item = service.backlog.findBacklogItem(itemId);
  if (!item || item.projectId !== projectId) { reply.code(404); return { message: "需求条目不存在" }; }
  return item;
}

async function handleUpdateBacklog(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; itemId: string };
  const projectId = parsePositiveInt(params.id);
  const itemId = parsePositiveInt(params.itemId);
  if (projectId === null || itemId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = request.body as Record<string, unknown> | null;
  if (!body) { reply.code(400); return { message: "请求体不能为空" }; }
  const updated = service.backlog.updateBacklogItem(itemId, body as Parameters<typeof service.backlog.updateBacklogItem>[1]);
  if (!updated) { reply.code(404); return { message: "需求条目不存在或迭代无效" }; }
  return updated;
}

async function handleDeleteBacklog(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const params = request.params as { id: string; itemId: string };
  const projectId = parsePositiveInt(params.id);
  const itemId = parsePositiveInt(params.itemId);
  if (projectId === null || itemId === null) { reply.code(400); return { message: "无效的 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "admin");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const deleted = service.backlog.deleteBacklogItem(itemId);
  if (!deleted) { reply.code(404); return { message: "需求条目不存在" }; }
  return { deleted: true };
}

async function handleAssignBacklog(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as { id: string }).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const body = request.body as { itemIds?: number[]; iterationId?: number | null } | null;
  if (!body || !Array.isArray(body.itemIds) || body.itemIds.length === 0) { reply.code(400); return { message: "itemIds 不能为空" }; }
  const result = service.backlog.assignToIteration(projectId, body.itemIds, body.iterationId ?? null);
  return result;
}

export function registerWorkspaceBacklogRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/projects/:id/backlog", { schema: { params: ID_PARAM } }, (req, rep) => handleListBacklog(service, req, rep));
  app.post("/projects/:id/backlog", { schema: { params: ID_PARAM } }, (req, rep) => handleCreateBacklog(service, req, rep));
  app.get("/projects/:id/backlog/:itemId", { schema: { params: ID_ITEM_PARAM } }, (req, rep) => handleGetBacklogItem(service, req, rep));
  app.put("/projects/:id/backlog/:itemId", { schema: { params: ID_ITEM_PARAM } }, (req, rep) => handleUpdateBacklog(service, req, rep));
  app.delete("/projects/:id/backlog/:itemId", { schema: { params: ID_ITEM_PARAM } }, (req, rep) => handleDeleteBacklog(service, req, rep));
  app.post("/projects/:id/backlog/assign", { schema: { params: ID_PARAM } }, (req, rep) => handleAssignBacklog(service, req, rep));
}
