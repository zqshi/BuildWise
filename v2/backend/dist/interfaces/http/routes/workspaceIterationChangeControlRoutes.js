"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceIterationChangeControlRoutes = registerWorkspaceIterationChangeControlRoutes;
const workspaceRouteUtils_1 = require("./workspaceRouteUtils");
function registerWorkspaceIterationChangeControlRoutes(app, service) {
    const allowedExecutionStatuses = new Set(["pending", "passed", "failed", "blocked", "skipped"]);
    app.get("/api/iterations/:id/change-control", async (request, reply) => {
        const params = request.params;
        const iterationId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const result = service.getIterationChangeControl(iterationId);
        if (!result) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return result;
    });
    app.post("/api/iterations/:id/change-control/confirm", async (request, reply) => {
        const params = request.params;
        const iterationId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        if (typeof body?.accurate !== "boolean") {
            reply.code(400);
            return { message: "accurate(boolean) is required" };
        }
        const result = service.confirmIterationAnalysis(iterationId, {
            accurate: body.accurate,
            note: body.note,
            actor: body.actor,
            resolvedClarificationQuestions: body.resolvedClarificationQuestions,
            boundary: body.boundary
        });
        if (!result.ok) {
            if (result.reason === "clarification_questions_unresolved") {
                reply.code(409);
                return {
                    message: "clarification questions unresolved",
                    unresolvedQuestions: result.unresolvedQuestions
                };
            }
            reply.code(404);
            return { message: "iteration not found" };
        }
        return result.data;
    });
    app.post("/api/iterations/:id/change-control/boundary", async (request, reply) => {
        const params = request.params;
        const iterationId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const result = service.updateIterationBoundary(iterationId, {
            requirementRefs: body?.requirementRefs,
            componentRefs: body?.componentRefs,
            codePaths: body?.codePaths,
            note: body?.note
        });
        if (!result) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return result;
    });
    app.post("/api/iterations/:id/change-control/draft", async (request, reply) => {
        const params = request.params;
        const iterationId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const updated = service.updateClarificationDraft(iterationId, Array.isArray(body?.resolvedQuestions) ? body.resolvedQuestions : []);
        if (!updated) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return updated;
    });
    app.post("/api/iterations/:id/change-control/test-matrix/execution", async (request, reply) => {
        const params = request.params;
        const iterationId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
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
        const result = service.updateIterationTestMatrixExecution(iterationId, updates);
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
}
