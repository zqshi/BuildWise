import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureIterationAccess, ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

type IdParams = { id: string };
const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id"] as const };

async function handlePublish(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as IdParams).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { commitMessage?: string; openPr?: boolean; prTitle?: string; prBody?: string; dryRun?: boolean } | null;
  const result = await service.project.publishIterationToRemote(iterationId, {
    commitMessage: body?.commitMessage, openPr: body?.openPr, prTitle: body?.prTitle, prBody: body?.prBody, dryRun: body?.dryRun,
  });
  if (!result.ok) return resolvePublishError(reply, result);
  return result.data;
}

function resolvePublishError(reply: FastifyReply, result: { ok: false; reason: string; message?: string; blockers?: unknown }) {
  const reasonMap: Record<string, [number, string]> = {
    iteration_not_found: [404, "迭代不存在"],
    repository_not_scaffolded: [409, "仓库尚未初始化"],
    analysis_confirmation_required: [409, "需要先确认分析报告"],
    remote_required_for_publish: [409, result.message || "需要绑定远程仓库才能发布"],
  };
  const mapped = reasonMap[result.reason];
  if (mapped) { reply.code(mapped[0]); return { message: mapped[1] }; }
  if (result.reason === "release_review_blocked" || result.reason === "boundary_violation") {
    reply.code(409);
    return { message: result.message || "发布受阻", blockers: Array.isArray(result.blockers) ? result.blockers : [] };
  }
  reply.code(502); return { message: result.message || "发布失败" };
}

async function handlePostCodeLink(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as IdParams).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { branch?: string; tag?: string; commit?: string; pr?: string; paths?: string[]; note?: string } | null;
  const linked = service.changeControl.bindIterationCodeLink(iterationId, {
    branch: body?.branch, tag: body?.tag, commit: body?.commit, pr: body?.pr, paths: body?.paths, note: body?.note,
  });
  if (!linked) { reply.code(404); return { message: "迭代不存在" }; }
  return linked;
}

async function handleGetCodeLink(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as IdParams).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const codeLink = service.changeControl.getIterationCodeLink(iterationId);
  if (!codeLink) { reply.code(404); return { message: "代码链接不存在" }; }
  return codeLink;
}

async function handleCodeTrace(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const projectId = parsePositiveInt((request.params as IdParams).id);
  if (projectId === null) { reply.code(400); return { message: "无效的项目 ID" }; }
  const access = ensureProjectAccess(service, request, reply, projectId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
  const ref = ((request.query as { ref?: string } | null)?.ref || "").trim();
  if (!ref) { reply.code(400); return { message: "请提供代码引用" }; }
  if (!service.project.hasProject(projectId)) { reply.code(404); return { message: "项目不存在" }; }
  return { projectId, ref, matches: service.iteration.locateIterationsByCodeRef(projectId, ref) };
}

export function registerRepositoryPublishRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/publish", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      commitMessage: { type: "string" }, openPr: { type: "boolean" }, prTitle: { type: "string" }, prBody: { type: "string" }, dryRun: { type: "boolean" },
    }, additionalProperties: false } }
  }, (req, rep) => handlePublish(service, req, rep));

  app.post("/iterations/:id/code-link", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      branch: { type: "string" }, tag: { type: "string" }, commit: { type: "string" }, pr: { type: "string" },
      paths: { type: "array", items: { type: "string" } }, note: { type: "string" },
    }, additionalProperties: false } }
  }, (req, rep) => handlePostCodeLink(service, req, rep));

  app.get("/iterations/:id/code-link", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetCodeLink(service, req, rep));

  app.get("/projects/:id/code-trace", {
    schema: { params: ITER_PARAM_SCHEMA, querystring: { type: "object", properties: { ref: { type: "string", minLength: 1 } }, required: ["ref"] } }
  }, (req, rep) => handleCodeTrace(service, req, rep));
}
