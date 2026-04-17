import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import { ALLOWED_EXECUTION_STATUSES } from "../../../domain/workspace/iterationTypes";
import { resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";
import { ensureIterationAccess } from "./workspaceRouteUtils";

const ITER_PARAM_SCHEMA = { type: "object" as const, properties: { id: { type: "string" as const, pattern: "^\\d+$" } }, required: ["id" as const] };

async function handleUpdateTestMatrixExecution(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { updates?: Array<{ caseId?: string; status?: string; by?: string; note?: string }> } | null;
  const updates = Array.isArray(body?.updates)
    ? body.updates.map((item) => ({
        caseId: typeof item?.caseId === "string" ? item.caseId : "",
        status: typeof item?.status === "string" ? item.status.toLowerCase() : "",
        by: typeof item?.by === "string" ? item.by : "",
        note: typeof item?.note === "string" ? item.note : "",
      }))
    : [];
  if (updates.length === 0 || updates.some((item) => !item.caseId.trim() || !ALLOWED_EXECUTION_STATUSES.has(item.status))) {
    reply.code(400); return { message: "请为每条测试用例提供编号和执行状态" };
  }
  const result = service.changeControl.updateIterationTestMatrixExecution(
    iterationId,
    updates as Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>,
  );
  if (!result.ok) return resolveExecutionError(reply, result);
  return result;
}

function resolveExecutionError(reply: FastifyReply, result: { ok: false; reason: string; missingCaseIds?: unknown }) {
  if (result.reason === "iteration_not_found") { reply.code(404); return { message: "迭代不存在" }; }
  if (result.reason === "case_not_found") { reply.code(409); return { message: "测试用例不存在", missingCaseIds: result.missingCaseIds }; }
  if (result.reason === "test_matrix_missing") { reply.code(409); return { message: "测试矩阵尚未生成" }; }
  reply.code(400); return { message: "更新内容无效" };
}

async function handleGenerateTestArtifacts(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "write");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const body = request.body as { dryRun?: boolean } | null;
  const result = await service.quality.generateIterationTestArtifacts(iterationId, { dryRun: body?.dryRun === true });
  if (!result) { reply.code(404); return { message: "迭代不存在" }; }
  return result;
}

async function handleGetReleaseReview(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const iterationId = resolveIterationId(reply, (request.params as { id: string }).id);
  if (iterationId === null) return { message: "无效的迭代 ID" };
  const access = ensureIterationAccess(service, request, reply, iterationId, "read");
  if (!access) return { message: reply.statusCode === 404 ? "迭代不存在" : "没有权限" };
  const result = service.quality.getIterationReleaseReview(iterationId);
  if (!result) { reply.code(404); return { message: "迭代不存在" }; }
  return result;
}

export function registerWorkspaceIterationChangeControlQualityRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/iterations/:id/change-control/test-matrix/execution", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: {
      updates: { type: "array", items: { type: "object", properties: {
        caseId: { type: "string" }, status: { type: "string", enum: ["pending", "passed", "failed", "blocked", "skipped"] },
        by: { type: "string" }, note: { type: "string" },
      } } },
    }, required: ["updates"], additionalProperties: false } }
  }, (req, rep) => handleUpdateTestMatrixExecution(service, req, rep));

  app.post("/iterations/:id/change-control/test-artifacts/generate", {
    schema: { params: ITER_PARAM_SCHEMA, body: { type: "object", properties: { dryRun: { type: "boolean" } }, additionalProperties: false } }
  }, (req, rep) => handleGenerateTestArtifacts(service, req, rep));

  app.get("/iterations/:id/release-review", { schema: { params: ITER_PARAM_SCHEMA } },
    (req, rep) => handleGetReleaseReview(service, req, rep));
}
