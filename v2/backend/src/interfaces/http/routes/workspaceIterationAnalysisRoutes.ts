import type { FastifyInstance } from "fastify";
import type { AttachmentUploadInput } from "../../../domain/workspace/types";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { currentRole, ensureIterationAccess, handleRouteError, parsePositiveInt } from "./workspaceRouteUtils";
import { parseAttachmentUploadInput } from "./workspaceIterationCoreRoutes";

export function registerIterationAnalysisRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/analysis", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const } } }, async (request, reply) => {
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
    const body = request.body as Parameters<typeof parseAttachmentUploadInput>[0];
    const parsed = parseAttachmentUploadInput(body);
    if (!parsed.input) {
      reply.code(400);
      return { message: parsed.error };
    }
    let result;
    try {
      result = await service.analysis.analyzeAttachment(iterationId, parsed.input);
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
      return { message: "迭代不存在" };
    }
    return result;
  });

  app.post("/iterations/:id/full-cycle", { schema: { params: { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] }, body: { type: "object" as const } } }, async (request, reply) => {
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
        return { message: `分析输入无效：${parsed.error}` };
      }
      parsedAnalysisInput = parsed.input;
    }
    let result;
    try {
      result = await service.fullCycle.runIterationFullCycle(iterationId, {
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
      return { message: "迭代不存在" };
    }
    return result;
  });
}
