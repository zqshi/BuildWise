import type { FastifyInstance } from "fastify";
import { hasPermission } from "../../../application/platform/platformSupport";
import { isIterationStatus } from "../../../application/workspace/workspaceSupport";
import type { AttachmentReportSection, AttachmentUploadInput } from "../../../domain/workspace/types";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";

function parseAttachmentUploadInput(body: {
  fileName?: string;
  mimeType?: string;
  size?: number;
  excerpt?: string;
  sourceType?: "single-file" | "folder";
  folderName?: string;
  files?: Array<{ path?: string; fileName?: string; mimeType?: string; size?: number; excerpt?: string; imageDataUrl?: string }>;
  visionPayloads?: Array<{ path?: string; mimeType?: string; dataUrl?: string }>;
  excerptChunks?: string[];
  excerptDigest?: string;
  excerptStrategy?: "direct" | "chunked-head-middle-tail" | "binary-no-text" | "folder-batch";
  agentScope?: "attachment" | "iteration" | "full-cycle" | "release";
  forceMultiAgent?: boolean;
  autoTransition?: boolean;
} | null): { input: AttachmentUploadInput | null; error: string } {
  const fileName = body?.fileName?.trim();
  if (!fileName) {
    return { input: null, error: "fileName is required" };
  }
  if (body?.sourceType === "folder" && (!Array.isArray(body.files) || body.files.length === 0)) {
    return { input: null, error: "files[] is required when sourceType=folder" };
  }
  return {
    input: {
      fileName,
      mimeType: body?.mimeType?.trim() || "application/octet-stream",
      size: typeof body?.size === "number" && Number.isFinite(body.size) ? body.size : 0,
      excerpt: body?.excerpt?.slice(0, 8000) || "",
      sourceType: body?.sourceType === "folder" ? "folder" : "single-file",
      folderName: body?.folderName?.trim() || "",
      files: Array.isArray(body?.files)
        ? body.files
            .map((item) => ({
              path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
              fileName: typeof item?.fileName === "string" ? item.fileName.slice(0, 120) : "",
              mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "application/octet-stream",
              size: typeof item?.size === "number" && Number.isFinite(item.size) ? item.size : 0,
              excerpt: typeof item?.excerpt === "string" ? item.excerpt.slice(0, 1200) : "",
              imageDataUrl: typeof item?.imageDataUrl === "string" ? item.imageDataUrl.slice(0, 300000) : ""
            }))
            .filter((item) => item.fileName.trim().length > 0)
            .slice(0, 1000)
        : [],
      visionPayloads: Array.isArray(body?.visionPayloads)
        ? body.visionPayloads
            .map((item) => ({
              path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
              mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "image/*",
              dataUrl: typeof item?.dataUrl === "string" ? item.dataUrl.slice(0, 300000) : ""
            }))
            .filter((item) => item.dataUrl.startsWith("data:image/"))
            .slice(0, 2)
        : [],
      excerptChunks: Array.isArray(body?.excerptChunks)
        ? body.excerptChunks
            .map((item) => String(item).slice(0, 2000))
            .filter((item) => item.trim())
            .slice(0, 8)
        : [],
      excerptDigest: body?.excerptDigest?.slice(0, 300) || "",
      excerptStrategy: body?.excerptStrategy,
      agentScope: body?.agentScope,
      forceMultiAgent: Boolean(body?.forceMultiAgent),
      autoTransition: Boolean(body?.autoTransition)
    },
    error: ""
  };
}

function parseUploadInitBody(body: {
  sourceType?: "single-file" | "folder";
  folderName?: string;
  idempotencyKey?: string;
  files?: Array<{ path?: string; fileName?: string; mimeType?: string; size?: number; sha256?: string; chunkCount?: number }>;
} | null) {
  const idempotencyKey = body?.idempotencyKey?.trim() || "";
  if (!idempotencyKey) {
    return { input: null as null, error: "idempotencyKey is required" };
  }
  const files = Array.isArray(body?.files)
    ? body.files
        .map((item) => ({
          path: typeof item?.path === "string" ? item.path.slice(0, 260) : "",
          fileName: typeof item?.fileName === "string" ? item.fileName.slice(0, 120) : "",
          mimeType: typeof item?.mimeType === "string" ? item.mimeType.slice(0, 120) : "application/octet-stream",
          size: typeof item?.size === "number" && Number.isFinite(item.size) ? item.size : 0,
          sha256: typeof item?.sha256 === "string" ? item.sha256.slice(0, 128) : "",
          chunkCount: typeof item?.chunkCount === "number" && Number.isFinite(item.chunkCount) ? Math.max(1, Math.floor(item.chunkCount)) : 1
        }))
        .filter((item) => item.fileName.trim().length > 0)
    : [];
  if (files.length === 0) {
    return { input: null as null, error: "files[] is required" };
  }
  const sourceType: "single-file" | "folder" = body?.sourceType === "folder" ? "folder" : "single-file";
  return {
    input: {
      sourceType,
      folderName: body?.folderName?.trim() || "",
      idempotencyKey,
      files
    },
    error: ""
  };
}

export function registerWorkspaceIterationCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/messages", async (request, reply) => {
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
    return service.listMessages(iterationId);
  });

  app.post("/iterations/:id/messages", async (request, reply) => {
    const authRole = currentRole(request.authRole);
    if (authRole === "viewer") {
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
    const body = request.body as { role?: string; content?: string } | null;
    const ALLOWED_ROLES = ["user", "assistant", "system"] as const;
    type MessageRole = (typeof ALLOWED_ROLES)[number];
    const rawRole = (body?.role ?? "user").trim();
    const role: MessageRole = ALLOWED_ROLES.includes(rawRole as MessageRole) ? (rawRole as MessageRole) : "user";
    const content = body?.content?.trim();
    if (!content) {
      reply.code(400);
      return { message: "content is required" };
    }
    return service.createMessage(iterationId, role, content);
  });

  app.post("/iterations/:id/interaction-state", async (request, reply) => {
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
    const body = request.body as {
      hasPrototypeAssets?: boolean;
      uploadKind?: "documents" | "prototype" | "mixed" | "other";
      lastAttachmentName?: string;
    } | null;
    if (typeof body?.hasPrototypeAssets !== "boolean") {
      reply.code(400);
      return { message: "hasPrototypeAssets is required" };
    }
    const updated = service.updateIterationInteractionState(iterationId, {
      hasPrototypeAssets: body.hasPrototypeAssets,
      uploadKind: body.uploadKind,
      lastAttachmentName: body.lastAttachmentName
    });
    if (!updated) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return { ok: true, iterationId: updated.id, interactionState: updated.interactionState };
  });

  app.post("/iterations/:id/agent-chat", async (request, reply) => {
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
    const body = request.body as { message?: string } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
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
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/visual-edit/execute", async (request, reply) => {
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
    const body = request.body as {
      message?: string;
      target?: {
        mode?: "html" | "image" | "prototype";
        target?: string;
        summary?: string;
        html?: {
          selector?: string;
          tag?: string;
          text?: string;
          styles?: Record<string, string>;
        };
      };
    } | null;
    const message = body?.message?.trim() || "";
    if (!message) {
      reply.code(400);
      return { message: "message is required" };
    }
    let result;
    try {
      result = await service.executeVisualEditInstruction(iterationId, message, body?.target);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/code-rewrite", async (request, reply) => {
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
    const body = request.body as { instruction?: string; dryRun?: boolean; maxFiles?: number } | null;
    const instruction = body?.instruction?.trim() || "";
    if (!instruction) {
      reply.code(400);
      return { message: "instruction is required" };
    }
    let result;
    try {
      result = await service.rewriteCodeInBoundary(iterationId, {
        instruction,
        dryRun: body?.dryRun === true,
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
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/analysis", async (request, reply) => {
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
    let result;
    try {
      result = await service.analyzeAttachment(iterationId, parsed.input);
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/full-cycle", async (request, reply) => {
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
    const body = request.body as {
      analysisInput?: Parameters<typeof parseAttachmentUploadInput>[0];
      runAnalysis?: boolean;
      autoConfirmAnalysis?: boolean;
      autoResolveClarifications?: boolean;
      rewriteInstruction?: string;
      rewriteDryRun?: boolean;
      rewriteMaxFiles?: number;
      generateTestArtifacts?: boolean;
      testArtifactsDryRun?: boolean;
      refreshReleaseReview?: boolean;
      generateDeliveryPackage?: boolean;
      deliveryPackageDryRun?: boolean;
      publish?: {
        enabled?: boolean;
        dryRun?: boolean;
        openPr?: boolean;
        commitMessage?: string;
        prTitle?: string;
        prBody?: string;
      };
    } | null;
    const runAnalysis = body?.runAnalysis !== false;
    let parsedAnalysisInput: AttachmentUploadInput | undefined = undefined;
    if (runAnalysis) {
      const parsed = parseAttachmentUploadInput(body?.analysisInput || null);
      if (!parsed.input) {
        reply.code(400);
        return { message: `analysisInput invalid: ${parsed.error}` };
      }
      parsedAnalysisInput = parsed.input;
    }
    let result;
    try {
      result = await service.runIterationFullCycle(iterationId, {
        analysisInput: parsedAnalysisInput,
        runAnalysis,
        autoConfirmAnalysis: body?.autoConfirmAnalysis,
        autoResolveClarifications: body?.autoResolveClarifications,
        rewriteInstruction: body?.rewriteInstruction,
        rewriteDryRun: body?.rewriteDryRun,
        rewriteMaxFiles: typeof body?.rewriteMaxFiles === "number" ? body.rewriteMaxFiles : undefined,
        generateTestArtifacts: body?.generateTestArtifacts,
        testArtifactsDryRun: body?.testArtifactsDryRun,
        refreshReleaseReview: body?.refreshReleaseReview,
        generateDeliveryPackage: body?.generateDeliveryPackage,
        deliveryPackageDryRun: body?.deliveryPackageDryRun,
        publish: body?.publish
      });
    } catch (error) {
      const handled = handleRouteError(error);
      if (handled) {
        reply.code(handled.code);
        return { message: handled.message };
      }
      throw error;
    }
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/uploads/init", async (request, reply) => {
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
    const body = request.body as Parameters<typeof parseUploadInitBody>[0];
    const parsed = parseUploadInitBody(body);
    if (!parsed.input) {
      reply.code(400);
      return { message: parsed.error };
    }
    const created = service.initAttachmentUpload(iterationId, parsed.input);
    if (!created) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return {
      uploadId: created.uploadId,
      status: created.status,
      sourceType: created.sourceType,
      files: created.files.map((item) => ({
        fileId: item.fileId,
        fileName: item.fileName,
        path: item.path,
        missingChunkIndexes: item.chunkBitmap.map((ok, idx) => (!ok ? idx : -1)).filter((idx) => idx >= 0)
      }))
    };
  });

  app.put("/iterations/:id/uploads/:uploadId/files/:fileId/chunks/:chunkIndex", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string; uploadId: string; fileId: string; chunkIndex: string };
    const iterationId = parsePositiveInt(params.id);
    const chunkIndex = parsePositiveInt(params.chunkIndex);
    if (iterationId === null || chunkIndex === null) {
      reply.code(400);
      return { message: "invalid path params" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const body = request.body as { dataBase64?: string } | null;
    const dataBase64 = body?.dataBase64?.trim() || "";
    if (!dataBase64) {
      reply.code(400);
      return { message: "dataBase64 is required" };
    }
    let chunk: Uint8Array;
    try {
      chunk = Buffer.from(dataBase64, "base64");
    } catch {
      reply.code(400);
      return { message: "invalid base64 chunk payload" };
    }
    const ok = service.putAttachmentUploadChunk(iterationId, params.uploadId, params.fileId, chunkIndex - 1, chunk);
    if (!ok) {
      reply.code(404);
      return { message: "upload/file/chunk target not found" };
    }
    reply.code(204);
    return null;
  });

  app.post("/iterations/:id/uploads/:uploadId/complete", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string; uploadId: string };
    const iterationId = parsePositiveInt(params.id);
    if (iterationId === null) {
      reply.code(400);
      return { message: "invalid iteration id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const completed = service.completeAttachmentUpload(iterationId, params.uploadId);
    if (!completed) {
      reply.code(404);
      return { message: "upload not found or incomplete" };
    }
    return {
      uploadId: completed.upload.uploadId,
      status: completed.upload.status,
      ingestJobId: completed.ingestJob.ingestJobId
    };
  });

  app.post("/iterations/:id/analysis/jobs", async (request, reply) => {
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
      created = service.submitAttachmentAnalysisJob(iterationId, parsed.input);
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

  app.post("/iterations/:id/analysis/jobs/by-upload", async (request, reply) => {
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
      created = service.submitAttachmentAnalysisJobFromUpload(iterationId, uploadId, body?.schemaVersion || "v2");
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

  app.post("/iterations/:id/analysis/jobs/retry-latest", async (request, reply) => {
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
      created = service.retryLatestFailedAttachmentAnalysisJob(iterationId);
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

  app.post("/iterations/:id/analysis/jobs/:jobId/retry", async (request, reply) => {
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
      created = service.retryAttachmentAnalysisJob(iterationId, {
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

  app.get("/iterations/:id/analysis/jobs/:jobId", async (request, reply) => {
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
    const job = service.getAttachmentAnalysisJob(iterationId, jobId);
    if (!job) {
      reply.code(404);
      return { message: "analysis job not found" };
    }
    return job;
  });

  app.get("/iterations/:id/analysis/jobs/:jobId/report-index", async (request, reply) => {
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
    const report = service.getAttachmentReportIndexByJob(iterationId, params.jobId);
    if (!report) {
      reply.code(404);
      return { message: "report not found" };
    }
    return report;
  });

  app.get("/reports/:reportId/sections/:sectionKey", async (request, reply) => {
    const params = request.params as { reportId: string; sectionKey: AttachmentReportSection["sectionKey"] };
    const query = request.query as { cursor?: string; limit?: string };
    const iterationId = service.findAttachmentReportIterationId(params.reportId);
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
    const section = service.getAttachmentReportSection(
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

  app.get("/iterations/:id/context", async (request, reply) => {
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
    const context = service.getIterationContext(iterationId);
    if (!context) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return context;
  });

  app.get("/iterations/:id/state-machine", async (request, reply) => {
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
    const stateMachine = service.getStateMachine(iterationId);
    if (!stateMachine) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return stateMachine;
  });

  app.post("/iterations/:id/state/transition", async (request, reply) => {
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
    const role = access.projectAccess.workspaceRole;
    const grantedPermissions = service.resolveRolePermissions(role);
    if (!hasPermission(role, "iteration:transition", grantedPermissions)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const body = request.body as { toStatus?: string; reason?: string } | null;
    const toStatus = body?.toStatus?.trim();
    if (!toStatus) {
      reply.code(400);
      return { message: "toStatus is required" };
    }
    if (!isIterationStatus(toStatus)) {
      reply.code(400);
      return { message: "invalid toStatus" };
    }
    if (toStatus === "completed" && !hasPermission(role, "iteration:transition:complete", grantedPermissions)) {
      reply.code(403);
      return { message: "permission denied" };
    }
    const reason = body?.reason?.trim() || "状态转换";
    const transition = service.transitionIteration(
      iterationId,
      toStatus,
      {
        source: "manual",
        reason,
        operator: request.authSub ? `user:${request.authSub}` : `user:${role}`,
        operatorRole: role
      }
    );
    if (!transition.ok) {
      if (transition.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      if (transition.reason === "reason_required" || transition.reason === "reason_too_short") {
        reply.code(400);
        return { message: transition.reason === "reason_required" ? "reason is required" : "reason must be at least 10 characters for manual transition" };
      }
      if (transition.reason === "invalid_transition") {
        reply.code(409);
        return { message: "invalid transition" };
      }
      reply.code(400);
      return { message: "transition failed" };
    }
    return transition.data;
  });

  app.get("/iterations/:id/assessment", async (request, reply) => {
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
    const result = service.getAssessment(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.get("/iterations/:id/assessment/history", async (request, reply) => {
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
    return service.listAssessmentSnapshots(iterationId);
  });

  app.post("/iterations/:id/assessment/recompute", async (request, reply) => {
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
    const result = service.recomputeAssessment(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.post("/iterations/:id/assessment/restore/:snapshotId", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    const params = request.params as { id: string; snapshotId: string };
    const iterationId = parsePositiveInt(params.id);
    const snapshotId = parsePositiveInt(params.snapshotId);
    if (iterationId === null || snapshotId === null) {
      reply.code(400);
      return { message: "invalid iteration id or snapshot id" };
    }
    const access = ensureIterationAccess(service, request, reply, iterationId, "write");
    if (!access) {
      return { message: reply.statusCode === 404 ? "iteration not found" : "permission denied" };
    }
    const result = service.restoreSnapshot(iterationId, snapshotId);
    if (!result) {
      reply.code(404);
      return { message: "iteration or snapshot not found" };
    }
    return result;
  });
}
