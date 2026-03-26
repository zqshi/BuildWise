import type { FastifyInstance } from "fastify";
import type { AttachmentUploadInput } from "../../../domain/workspace/types";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";

export function parseAttachmentUploadInput(body: {
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

export function registerWorkspaceIterationCoreRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.get("/iterations/:id/messages", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] } } }, async (request, reply) => {
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

  app.post("/iterations/:id/messages", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { role: { type: "string" as const }, content: { type: "string" as const } }, required: ["content" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const body = request.body as { role?: string; content?: string } | null;
    const content = body?.content?.trim();
    if (!content) {
      reply.code(400);
      return { message: "content is required" };
    }
    const messageRole = body?.role === "assistant" ? "assistant" : "user";
    const added = service.createMessage(iterationId, messageRole, content);
    if (!added) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return added;
  });

  app.post("/iterations/:id/interaction-state", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { hasPrototypeAssets: { type: "boolean" as const }, uploadKind: { type: "string" as const, enum: ["documents", "prototype", "mixed", "other"] }, lastAttachmentName: { type: "string" as const } }, required: ["hasPrototypeAssets" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const updated = service.updateIterationInteractionState(iterationId, {
      hasPrototypeAssets: Boolean(body?.hasPrototypeAssets),
      uploadKind: body?.uploadKind || "documents",
      lastAttachmentName: body?.lastAttachmentName?.trim() || ""
    });
    if (!updated) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return updated;
  });

  app.post("/iterations/:id/agent-chat", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { message: { type: "string" as const, minLength: 1 } }, required: ["message" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const message = body?.message?.trim();
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
    return result;
  });

  app.post("/iterations/:id/visual-edit/execute", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { message: { type: "string" as const }, target: { type: "object" as const } }, required: ["message" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const body = request.body as { message?: string; target?: Record<string, unknown> } | null;
    const message = body?.message?.trim();
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
    return result;
  });

  app.post("/iterations/:id/code-rewrite", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const, properties: { instruction: { type: "string" as const }, dryRun: { type: "boolean" as const }, maxFiles: { type: "integer" as const } }, required: ["instruction" as const], additionalProperties: false } } }, async (request, reply) => {
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
    const instruction = body?.instruction?.trim();
    if (!instruction) {
      reply.code(400);
      return { message: "instruction is required" };
    }
    let result;
    try {
      result = await service.rewriteCodeInBoundary(iterationId, {
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

  app.post("/iterations/:id/analysis", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const } } }, async (request, reply) => {
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

  app.post("/iterations/:id/full-cycle", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const } } }, async (request, reply) => {
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
}
