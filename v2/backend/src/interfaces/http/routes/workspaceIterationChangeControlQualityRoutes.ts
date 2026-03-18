import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import { resolveIterationId } from "./workspaceIterationChangeControlRouteHelpers";
import { currentRole } from "./workspaceRouteUtils";

const allowedExecutionStatuses = new Set(["pending", "passed", "failed", "blocked", "skipped"]);

export function registerWorkspaceIterationChangeControlQualityRoutes(app: FastifyInstance, service: WorkspaceService) {
  app.post("/api/iterations/:id/change-control/test-matrix/execution", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const body = request.body as {
      updates?: Array<{ caseId?: string; status?: string; by?: string; note?: string }>;
    } | null;
    const updates = Array.isArray(body?.updates)
      ? body.updates.map((item) => ({
          caseId: typeof item?.caseId === "string" ? item.caseId : "",
          status: typeof item?.status === "string" ? item.status.toLowerCase() : "",
          by: typeof item?.by === "string" ? item.by : "",
          note: typeof item?.note === "string" ? item.note : ""
        }))
      : [];
    if (updates.length === 0 || updates.some((item) => !item.caseId.trim() || !allowedExecutionStatuses.has(item.status))) {
      reply.code(400);
      return { message: "updates[] requires caseId and status(pending|passed|failed|blocked|skipped)" };
    }
    const result = service.updateIterationTestMatrixExecution(
      iterationId,
      updates as Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
    );
    if (!result.ok) {
      if (result.reason === "iteration_not_found") {
        reply.code(404);
        return { message: "iteration not found" };
      }
      if (result.reason === "case_not_found") {
        reply.code(409);
        return { message: "test case not found", missingCaseIds: result.missingCaseIds };
      }
      if (result.reason === "test_matrix_missing") {
        reply.code(409);
        return { message: "test matrix not generated" };
      }
      reply.code(400);
      return { message: "invalid updates" };
    }
    return result;
  });

  app.post("/api/iterations/:id/change-control/test-artifacts/generate", async (request, reply) => {
    const role = currentRole(request.authRole);
    if (role === "viewer") {
      reply.code(403);
      return { message: `permission denied for role ${role}` };
    }
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const body = request.body as { dryRun?: boolean } | null;
    const result = await service.generateIterationTestArtifacts(iterationId, { dryRun: body?.dryRun === true });
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });

  app.get("/api/iterations/:id/release-review", async (request, reply) => {
    const params = request.params as { id: string };
    const iterationId = resolveIterationId(reply, params.id);
    if (iterationId === null) {
      return { message: "invalid iteration id" };
    }
    const result = service.getIterationReleaseReview(iterationId);
    if (!result) {
      reply.code(404);
      return { message: "iteration not found" };
    }
    return result;
  });
}
