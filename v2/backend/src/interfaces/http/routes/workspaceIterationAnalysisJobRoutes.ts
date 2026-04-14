import type { FastifyInstance } from "fastify";
import type { AttachmentReportSection } from "../../../domain/workspace/types";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";
import { parseAttachmentUploadInput } from "./workspaceIterationCoreRoutes";

export function registerWorkspaceIterationAnalysisJobRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/analysis/jobs", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
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
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!created) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    reply.code(202);
    return created;
  });

  app.post("/iterations/:id/analysis/jobs/by-upload", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { uploadId: { type: "string" as const }, schemaVersion: { type: "string" as const } }, required: ["uploadId" as const], additionalProperties: false } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { uploadId?: string; schemaVersion?: string } | null;
    const uploadId = body?.uploadId?.trim() || "";
    if (!uploadId) {
      reply.code(400);
      return { message: "uploadId is required" };
    }
    let created;
    try {
      created = service.upload.submitAttachmentAnalysisJobFromUpload(iterationId, uploadId, body?.schemaVersion || "v2");
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!created) {
      reply.code(404);
      return { message: "upload not found or not ready" };
    }
    reply.code(202);
    return created;
  });

  app.post("/iterations/:id/analysis/jobs/retry-latest", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    let created;
    try {
      created = service.analysis.retryLatestFailedAttachmentAnalysisJob(iterationId);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!created) {
      reply.code(404);
      return { message: "failed analysis job not found" };
    }
    reply.code(202);
    return created;
  });

  app.post("/iterations/:id/analysis/jobs/:jobId/retry", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, jobId: { type: "string" as const, minLength: 1 } }, required: ["id" as const, "jobId" as const] }, body: { type: "object" as const, properties: { scope: { type: "string" as const, enum: ["job", "batch"] } }, additionalProperties: false } } }, async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string; jobId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { scope?: "job" | "batch" } | null;
    let created;
    try {
      created = service.analysis.retryAttachmentAnalysisJob(iterationId, {
        jobId: params.jobId,
        scope: body?.scope === "batch" ? "batch" : "job"
      });
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!created) {
      reply.code(404);
      return { message: "analysis job not found" };
    }
    reply.code(202);
    return created;
  });

  app.get("/iterations/:id/analysis/latest-report", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const report = service.analysis.getLatestCompletedAnalysisReport(iterationId);
    if (!report) {
      reply.code(404);
      return { message: "no completed analysis report found" };
    }
    return report;
  });

  app.get("/iterations/:id/analysis/jobs/:jobId", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, jobId: { type: "string" as const, minLength: 1 } }, required: ["id" as const, "jobId" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string; jobId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const jobId = (params.jobId || "").trim();
    if (!jobId) {
      reply.code(400);
      return { message: "invalid job id" };
    }
    const job = service.analysis.getAttachmentAnalysisJob(iterationId, jobId);
    if (!job) {
      reply.code(404);
      return { message: "analysis job not found" };
    }
    return job;
  });

  app.get("/iterations/:id/analysis/jobs/:jobId/report-index", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, jobId: { type: "string" as const, minLength: 1 } }, required: ["id" as const, "jobId" as const] } } }, async (request, reply) => {
    const params = request.params as { id: string; jobId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const report = service.analysis.getAttachmentReportIndexByJob(iterationId, params.jobId);
    if (!report) {
      reply.code(404);
      return { message: "report not found" };
    }
    return report;
  });

  app.get("/reports/:reportId/sections/:sectionKey", { schema: { params: { type: "object" as const, properties: { reportId: { type: "string" as const, minLength: 1 }, sectionKey: { type: "string" as const, minLength: 1 } }, required: ["reportId" as const, "sectionKey" as const] }, querystring: { type: "object" as const, properties: { cursor: { type: "string" as const }, limit: { type: "string" as const } } } } }, async (request, reply) => {
    const params = request.params as { reportId: string; sectionKey: AttachmentReportSection["sectionKey"] };
    const query = request.query as { cursor?: string; limit?: string };
    const iterationId = service.analysis.findAttachmentReportIterationId(params.reportId);
    if (iterationId === null) {
      reply.code(404);
      return { message: "section not found" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "read");
    if (!access) {
      return { message: reply.statusCode === 404 ? "section not found" : "permission denied" };
    }
    const cursor = Number.parseInt((query?.cursor || "").trim(), 10);
    const limit = Number.parseInt((query?.limit || "").trim(), 10);
    const section = service.analysis.getAttachmentReportSection(
      params.reportId,
      params.sectionKey,
      Number.isFinite(cursor) ? cursor : 0,
      Number.isFinite(limit) ? limit : 20
    );
    if (!section) {
      reply.code(404);
      return { message: "section not found" };
    }
    return section;
  });
}
