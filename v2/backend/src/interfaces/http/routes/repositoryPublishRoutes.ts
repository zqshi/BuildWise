import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ensureIterationAccess, ensureProjectAccess, parsePositiveInt } from "./workspaceRouteUtils";

export function registerRepositoryPublishRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/publish", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          commitMessage: { type: "string" },
          openPr: { type: "boolean" },
          prTitle: { type: "string" },
          prBody: { type: "string" },
          dryRun: { type: "boolean" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
      commitMessage?: string;
      openPr?: boolean;
      prTitle?: string;
      prBody?: string;
      dryRun?: boolean;
    } | null;
    const result = await service.project.publishIterationToRemote(iterationId, {
      commitMessage: body?.commitMessage,
      openPr: body?.openPr,
      prTitle: body?.prTitle,
      prBody: body?.prBody,
      dryRun: body?.dryRun
    });
    if (!result.ok) {
      if (result.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "迭代不存在" };
      }
      if (result.reason === "repository_not_scaffolded") {
        reply.code(409);
        return { message: "仓库尚未初始化" };
      }
      if (result.reason === "analysis_confirmation_required") {
        reply.code(409);
        return { message: "需要先确认分析报告" };
      }
      if (result.reason === "release_review_blocked") {
        reply.code(409);
        return { message: result.message || "release review blocked", blockers: "blockers" in result ? (result.blockers as string[]) : [] };
      }
      if (result.reason === "boundary_violation") {
        reply.code(409);
        return { message: result.message || "boundary violation", blockers: "blockers" in result ? (result.blockers as string[]) : [] };
      }
      if (result.reason === "remote_required_for_publish") {
        reply.code(409);
        return { message: result.message || "remote repository is required for publish" };
      }
      reply.code(502);
      return { message: result.message || "iteration publish failed" };
    }
    return result.data;
  });

  app.post("/iterations/:id/code-link", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      body: {
        type: "object",
        properties: {
          branch: { type: "string" },
          tag: { type: "string" },
          commit: { type: "string" },
          pr: { type: "string" },
          paths: { type: "array", items: { type: "string" } },
          note: { type: "string" }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
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
      branch?: string;
      tag?: string;
      commit?: string;
      pr?: string;
      paths?: string[];
      note?: string;
    } | null;
    const linked = service.changeControl.bindIterationCodeLink(iterationId, {
      branch: body?.branch,
      tag: body?.tag,
      commit: body?.commit,
      pr: body?.pr,
      paths: body?.paths,
      note: body?.note
    });
    if (!linked) {
      reply.code(404);
      return { message: "迭代不存在" };
    }
    return linked;
  });

  app.get("/iterations/:id/code-link", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "无效的迭代 ID" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    }
    const codeLink = service.changeControl.getIterationCodeLink(iterationId);
    if (!codeLink) {
      reply.code(404);
      return { message: "代码链接不存在" };
    }
    return codeLink;
  });

  app.get("/projects/:id/code-trace", {
    schema: {
      params: {
        type: "object",
        properties: { id: { type: "string", pattern: "^\\d+$" } },
        required: ["id"]
      },
      querystring: {
        type: "object",
        properties: {
          ref: { type: "string", minLength: 1 }
        },
        required: ["ref"]
      }
    }
  }, async (request, reply) => {
    const params = request.params as { id: string };
    const projectId = parsePositiveInt(params.id);
    if (projectId === null) {
      reply.code(400);
      return { message: "无效的项目 ID" };
    }
    const access = ensureProjectAccess(service, request, reply, projectId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "项目不存在" : "没有权限" };
    }
    const query = request.query as { ref?: string } | null;
    const ref = query?.ref?.trim() || "";
    if (!ref) {
      reply.code(400);
      return { message: "请提供代码引用" };
    }
    if (!service.project.hasProject(projectId)) {
      reply.code(404);
      return { message: "项目不存在" };
    }
    return {
      projectId,
      ref,
      matches: service.iteration.locateIterationsByCodeRef(projectId, ref)
    };
  });
}
