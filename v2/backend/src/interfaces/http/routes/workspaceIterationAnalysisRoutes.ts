import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AttachmentUploadInput } from "../../../domain/workspace/types";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";
import { parseAttachmentUploadInput } from "./workspaceIterationCoreRoutes";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

async function handleAnalyzeAttachment(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const parsed = parseAttachmentUploadInput(request.body as Parameters<typeof parseAttachmentUploadInput>[0]);
  if (!parsed.input) { reply.code(400); return { message: parsed.error }; }
  try {
    const result = await service.analysis.analyzeAttachment(iterationId, parsed.input);
    if (!result) { reply.code(404); return { message: "迭代不存在" }; }
    return result;
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
}

async function handleFullCycle(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as {
    analysisInput?: Parameters<typeof parseAttachmentUploadInput>[0]; runAnalysis?: boolean;
    autoConfirmAnalysis?: boolean; autoResolveClarifications?: boolean;
    rewriteInstruction?: string; rewriteDryRun?: boolean; rewriteMaxFiles?: number;
    generateTestArtifacts?: boolean; testArtifactsDryRun?: boolean; refreshReleaseReview?: boolean;
    generateDeliveryPackage?: boolean; deliveryPackageDryRun?: boolean;
    publish?: { enabled?: boolean; dryRun?: boolean; openPr?: boolean; commitMessage?: string; prTitle?: string; prBody?: string };
  } | null;
  const opts = buildFullCycleOptions(body);
  if (typeof opts === "string") { reply.code(400); return { message: opts }; }
  try {
    const started = service.fullCycle.startFullCycleJob(iterationId, opts);
    if ("error" in started) { reply.code(500); return { message: started.error }; }
    reply.code(202);
    return { jobId: started.jobId, status: "running", iterationId };
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
}

async function handleFullCycleJobStatus(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const jobId = (request.params as { jobId: string }).jobId;
  const status = service.fullCycle.buildFullCycleJobStatus(jobId, iterationId);
  if (!status) { reply.code(404); return { message: "任务不存在或已过期" }; }
  return status;
}

async function handleCancelFullCycleJob(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  if (currentRole(request.authRole) === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const jobId = (request.params as { jobId: string }).jobId;
  const result = service.fullCycle.cancelFullCycleJob(jobId);
  if (!result.ok) { reply.code(409); return { message: result.reason || "任务不存在或已结束" }; }
  return { jobId, status: "cancelling", iterationId };
}

async function handleFullCycleInterrupted(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  return service.fullCycle.getInterruptedFullCycle(iterationId);
}

async function handleDetectChangeImpact(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = parsePositiveInt((request.params as { id: string }).id);
  if (iterationId === null) { reply.code(400); return { message: "无效的迭代 ID" }; }
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { message?: string } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  try {
    return service.changeImpact.detectChangeImpact(iterationId, message);
  } catch (error) {
    const handled = handleRouteError(error);
    if (handled) { reply.code(handled.code); return { message: handled.message }; }
    throw error;
  }
}

function buildFullCycleOptions(body: {
  analysisInput?: Parameters<typeof parseAttachmentUploadInput>[0]; runAnalysis?: boolean;
  autoConfirmAnalysis?: boolean; autoResolveClarifications?: boolean;
  rewriteInstruction?: string; rewriteDryRun?: boolean; rewriteMaxFiles?: number;
  generateTestArtifacts?: boolean; testArtifactsDryRun?: boolean; refreshReleaseReview?: boolean;
  generateDeliveryPackage?: boolean; deliveryPackageDryRun?: boolean;
  publish?: { enabled?: boolean; dryRun?: boolean; openPr?: boolean; commitMessage?: string; prTitle?: string; prBody?: string };
} | null): string | {
  analysisInput?: AttachmentUploadInput; runAnalysis: boolean;
  autoConfirmAnalysis?: boolean; autoResolveClarifications?: boolean;
  rewriteInstruction?: string; rewriteDryRun?: boolean; rewriteMaxFiles?: number;
  generateTestArtifacts?: boolean; testArtifactsDryRun?: boolean; refreshReleaseReview?: boolean;
  generateDeliveryPackage?: boolean; deliveryPackageDryRun?: boolean;
  publish?: { enabled?: boolean; dryRun?: boolean; openPr?: boolean; commitMessage?: string; prTitle?: string; prBody?: string };
} {
  const runAnalysis = body?.runAnalysis !== false;
  let parsedAnalysisInput: AttachmentUploadInput | undefined;
  if (runAnalysis) {
    const parsed = parseAttachmentUploadInput(body?.analysisInput || null);
    if (!parsed.input) return `分析输入无效：${parsed.error}`;
    parsedAnalysisInput = parsed.input;
  }
  return {
    analysisInput: parsedAnalysisInput, runAnalysis,
    autoConfirmAnalysis: body?.autoConfirmAnalysis, autoResolveClarifications: body?.autoResolveClarifications,
    rewriteInstruction: body?.rewriteInstruction, rewriteDryRun: body?.rewriteDryRun,
    rewriteMaxFiles: typeof body?.rewriteMaxFiles === "number" ? body.rewriteMaxFiles : undefined,
    generateTestArtifacts: body?.generateTestArtifacts, testArtifactsDryRun: body?.testArtifactsDryRun,
    refreshReleaseReview: body?.refreshReleaseReview,
    generateDeliveryPackage: body?.generateDeliveryPackage, deliveryPackageDryRun: body?.deliveryPackageDryRun,
    publish: body?.publish,
  };
}

export function registerIterationAnalysisRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/analysis", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object" } }
  }, (req, rep) => handleAnalyzeAttachment(service, req, rep));

  app.post("/iterations/:id/full-cycle", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object" } }
  }, (req, rep) => handleFullCycle(service, req, rep));

  // T7a: 明确的重试入口（复用 handleFullCycle，body 传续跑参数即复用 checkpoint 续跑）
  app.post("/iterations/:id/full-cycle/retry", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object" } }
  }, (req, rep) => handleFullCycle(service, req, rep));

  app.get("/iterations/:id/full-cycle/jobs/:jobId", {
    schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, jobId: { type: "string" as const } }, required: ["id" as const, "jobId" as const] } }
  }, (req, rep) => handleFullCycleJobStatus(service, req, rep));

  app.delete("/iterations/:id/full-cycle/jobs/:jobId", {
    schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" }, jobId: { type: "string" as const } }, required: ["id" as const, "jobId" as const] } }
  }, (req, rep) => handleCancelFullCycleJob(service, req, rep));

  app.get("/iterations/:id/full-cycle/interrupted", {
    schema: { params: ITER_PARAM_SCHEMA }
  }, (req, rep) => handleFullCycleInterrupted(service, req, rep));

  app.post("/iterations/:id/detect-change-impact", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object" } }
  }, (req, rep) => handleDetectChangeImpact(service, req, rep));
}
