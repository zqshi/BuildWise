import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AttachmentReportSection } from "../../../domain/workspace/types";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";
import { parseAttachmentUploadInput } from "./workspaceIterationCoreRoutes";

/* ── Shared schema fragments ── */

const iterationIdParamSchema = {
  type: "object" as const,
  properties: { id: { type: "string" as const, pattern: "^\\d+$" } },
  required: ["id" as const]
};

const iterationJobParamSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, pattern: "^\\d+$" },
    jobId: { type: "string" as const, minLength: 1 }
  },
  required: ["id" as const, "jobId" as const]
};

/* ── Shared guards ── */

function denyViewer(request: FastifyRequest, reply: FastifyReply): boolean {
  if (currentRole(request.authRole) === "viewer") {
    reply.code(403);
    return true;
  }
  return false;
}

function resolveWritableIteration(
  service: WorkspaceService, request: FastifyRequest, reply: FastifyReply
) {
  if (denyViewer(request, reply)) return null;
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) {
    reply.code(400);
    return null;
  }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return null;
  return iterationId;
}

function errorMessageForWriteGuard(reply: FastifyReply) {
  if (reply.statusCode === 403) return { message: "没有权限" };
  if (reply.statusCode === 400) return { message: "无效的迭代 ID" };
  return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
}

/* ── Route handlers ── */

function handleSubmitJob(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const iterationId = resolveWritableIteration(service, request, reply);
    if (iterationId === null) return errorMessageForWriteGuard(reply);
    const body = request.body as Parameters<typeof parseAttachmentUploadInput>[0];
    const parsed = parseAttachmentUploadInput(body);
    if (!parsed.input) {
      reply.code(400);
      return { message: parsed.error };
    }
    let created;
    try {
      created = service.analysis.submitAttachmentAnalysisJob(iterationId, parsed.input);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) { reply.code(handled.code); return { message: handled.message }; }
      throw error;
    }
    if (!created) { reply.code(404); return { message: "迭代不存在" }; }
    reply.code(202);
    return created;
  };
}

function handleSubmitJobByUpload(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const iterationId = resolveWritableIteration(service, request, reply);
    if (iterationId === null) return errorMessageForWriteGuard(reply);
    const body = request.body as { uploadId?: string; schemaVersion?: string } | null;
    const uploadId = body?.uploadId?.trim() || "";
    if (!uploadId) { reply.code(400); return { message: "请提供上传 ID" }; }
    let created;
    try {
      created = service.upload.submitAttachmentAnalysisJobFromUpload(iterationId, uploadId, body?.schemaVersion || "v2");
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) { reply.code(handled.code); return { message: handled.message }; }
      throw error;
    }
    if (!created) { reply.code(404); return { message: "上传不存在或尚未就绪" }; }
    reply.code(202);
    return created;
  };
}

function handleRetryLatest(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const iterationId = resolveWritableIteration(service, request, reply);
    if (iterationId === null) return errorMessageForWriteGuard(reply);
    let created;
    try {
      created = service.analysis.retryLatestFailedAttachmentAnalysisJob(iterationId);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) { reply.code(handled.code); return { message: handled.message }; }
      throw error;
    }
    if (!created) { reply.code(404); return { message: "未找到失败的分析任务" }; }
    reply.code(202);
    return created;
  };
}

function handleRetrySpecific(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const iterationId = resolveWritableIteration(service, request, reply);
    if (iterationId === null) return errorMessageForWriteGuard(reply);
    const params = request.params as { id: string; jobId: string };
    const body = request.body as { scope?: "job" | "batch" } | null;
    let created;
    try {
      created = service.analysis.retryAttachmentAnalysisJob(iterationId, {
        jobId: params.jobId,
        scope: body?.scope === "batch" ? "batch" : "job"
      });
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) { reply.code(handled.code); return { message: handled.message }; }
      throw error;
    }
    if (!created) { reply.code(404); return { message: "分析任务不存在" }; }
    reply.code(202);
    return created;
  };
}

function handleGetLatestReport(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const iterationId = parsePositiveInt((request.params as { id: string }).id);
    if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    const report = service.analysis.getLatestCompletedAnalysisReport(iterationId);
    if (!report) { reply.code(404); return { message: "未找到已完成的分析报告" }; }
    return report;
  };
}

function handleGetJob(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string; jobId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    const jobId = (params.jobId || "").trim();
    if (!jobId) { reply.code(400); return { message: "无效的任务 ID" }; }
    const job = service.analysis.getAttachmentAnalysisJob(iterationId, jobId);
    if (!job) { reply.code(404); return { message: "分析任务不存在" }; }
    return job;
  };
}

function handleGetReportIndex(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string; jobId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
    const report = service.analysis.getAttachmentReportIndexByJob(iterationId, params.jobId);
    if (!report) { reply.code(404); return { message: "报告不存在" }; }
    return report;
  };
}

function handleGetReportSection(service: WorkspaceService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { reportId: string; sectionKey: AttachmentReportSection["sectionKey"] };
    const query = request.query as { cursor?: string; limit?: string };
    const iterationId = service.analysis.findAttachmentReportIterationId(params.reportId);
    if (iterationId === null) { reply.code(404); return { message: "章节不存在" }; }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) return { message: reply.statusCode === 404 ? "章节不存在" : "没有权限" };
    const cursor = Number.parseInt((query?.cursor || "").trim(), 10);
    const limit = Number.parseInt((query?.limit || "").trim(), 10);
    const section = service.analysis.getAttachmentReportSection(
      params.reportId, params.sectionKey,
      Number.isFinite(cursor) ? cursor : 0,
      Number.isFinite(limit) ? limit : 20
    );
    if (!section) { reply.code(404); return { message: "章节不存在" }; }
    return section;
  };
}

/* ── Registration ── */

export function registerWorkspaceIterationAnalysisJobRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/analysis/jobs", {
    schema: { params: iterationIdParamSchema, body: { type: "object" as const } }
  }, handleSubmitJob(service));

  app.post("/iterations/:id/analysis/jobs/by-upload", {
    schema: {
      params: iterationIdParamSchema,
      body: {
        type: "object" as const,
        properties: { uploadId: { type: "string" as const }, schemaVersion: { type: "string" as const } },
        required: ["uploadId" as const],
        additionalProperties: false
      }
    }
  }, handleSubmitJobByUpload(service));

  app.post("/iterations/:id/analysis/jobs/retry-latest", {
    schema: { params: iterationIdParamSchema }
  }, handleRetryLatest(service));

  app.post("/iterations/:id/analysis/jobs/:jobId/retry", {
    schema: {
      params: iterationJobParamSchema,
      body: {
        type: "object" as const,
        properties: { scope: { type: "string" as const, enum: ["job", "batch"] } },
        additionalProperties: false
      }
    }
  }, handleRetrySpecific(service));

  app.get("/iterations/:id/analysis/latest-report", {
    schema: { params: iterationIdParamSchema }
  }, handleGetLatestReport(service));

  app.get("/iterations/:id/analysis/jobs/:jobId", {
    schema: { params: iterationJobParamSchema }
  }, handleGetJob(service));

  app.get("/iterations/:id/analysis/jobs/:jobId/report-index", {
    schema: { params: iterationJobParamSchema }
  }, handleGetReportIndex(service));

  app.get("/reports/:reportId/sections/:sectionKey", {
    schema: {
      params: {
        type: "object" as const,
        properties: {
          reportId: { type: "string" as const, minLength: 1 },
          sectionKey: { type: "string" as const, minLength: 1 }
        },
        required: ["reportId" as const, "sectionKey" as const]
      },
      querystring: {
        type: "object" as const,
        properties: { cursor: { type: "string" as const }, limit: { type: "string" as const } }
      }
    }
  }, handleGetReportSection(service));
}
