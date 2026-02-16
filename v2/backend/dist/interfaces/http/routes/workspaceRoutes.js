"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceRoutes = registerWorkspaceRoutes;
function parsePositiveInt(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : null;
}
async function registerWorkspaceRoutes(app, service) {
    app.get("/api/governance/roles", async () => {
        return service.listGovernanceRoles();
    });
    app.get("/api/governance/audit-logs", async (request, reply) => {
        const query = request.query;
        const limit = query?.limit ? Number(query.limit) : 50;
        if (!Number.isFinite(limit) || limit <= 0) {
            reply.code(400);
            return { message: "invalid limit" };
        }
        return service.listAuditLogs(Math.min(200, Math.floor(limit)));
    });
    app.get("/api/projects", async () => {
        return service.listProjects();
    });
    app.post("/api/projects", async (request, reply) => {
        const body = request.body;
        const name = body?.name?.trim();
        if (!name) {
            reply.code(400);
            return { message: "name is required" };
        }
        return service.createProject({
            name,
            description: body?.description?.trim() || "暂无描述"
        });
    });
    app.get("/api/projects/:id/iterations", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const items = service.listIterations(projectId);
        if (items === null) {
            reply.code(404);
            return { message: "project not found" };
        }
        return items;
    });
    app.post("/api/projects/:id/iterations", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const body = request.body;
        const name = body?.name?.trim();
        if (!name) {
            reply.code(400);
            return { message: "name is required" };
        }
        const created = service.createIteration(projectId, {
            name,
            description: body?.description?.trim() || "暂无描述",
            goals: Array.isArray(body?.goals) ? body?.goals : [],
            aiSummary: body?.aiSummary || "",
            scope: {
                inScope: Array.isArray(body?.scope?.inScope) ? body?.scope?.inScope : [],
                outOfScope: Array.isArray(body?.scope?.outOfScope) ? body?.scope?.outOfScope : [],
                acceptanceCriteria: Array.isArray(body?.scope?.acceptanceCriteria) ? body?.scope?.acceptanceCriteria : []
            }
        });
        if (!created) {
            reply.code(404);
            return { message: "project not found" };
        }
        return created;
    });
    app.get("/api/iterations/:id/messages", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        return service.listMessages(iterationId);
    });
    app.post("/api/iterations/:id/messages", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const role = body?.role ?? "user";
        const content = body?.content?.trim();
        if (!content) {
            reply.code(400);
            return { message: "content is required" };
        }
        return service.createMessage(iterationId, role, content);
    });
    app.post("/api/iterations/:id/analysis", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const fileName = body?.fileName?.trim();
        if (!fileName) {
            reply.code(400);
            return { message: "fileName is required" };
        }
        const result = await service.analyzeAttachment(iterationId, {
            fileName,
            mimeType: body?.mimeType?.trim() || "application/octet-stream",
            size: typeof body?.size === "number" && Number.isFinite(body.size) ? body.size : 0,
            excerpt: body?.excerpt?.slice(0, 4000) || "",
            agentScope: body?.agentScope,
            forceMultiAgent: Boolean(body?.forceMultiAgent),
            autoTransition: Boolean(body?.autoTransition)
        });
        if (!result) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return result;
    });
    app.get("/api/iterations/:id/context", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const context = service.getIterationContext(iterationId);
        if (!context) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return context;
    });
    app.get("/api/iterations/:id/state-machine", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const stateMachine = service.getStateMachine(iterationId);
        if (!stateMachine) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return stateMachine;
    });
    app.post("/api/iterations/:id/state/transition", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const toStatus = body?.toStatus?.trim();
        if (!toStatus) {
            reply.code(400);
            return { message: "toStatus is required" };
        }
        const transition = service.transitionIteration(iterationId, toStatus, body?.note?.trim() || "");
        if (!transition.ok) {
            if (transition.reason === "iteration_not_found") {
                reply.code(404);
                return { message: "iteration not found" };
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
    app.get("/api/iterations/:id/assessment", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const result = service.getAssessment(iterationId);
        if (!result) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return result;
    });
    app.get("/api/iterations/:id/assessment/history", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        return service.listAssessmentSnapshots(iterationId);
    });
    app.post("/api/iterations/:id/assessment/recompute", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const result = service.recomputeAssessment(iterationId);
        if (!result) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return result;
    });
    app.post("/api/iterations/:id/assessment/restore/:snapshotId", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        const snapshotId = parsePositiveInt(params.snapshotId);
        if (iterationId === null || snapshotId === null) {
            reply.code(400);
            return { message: "invalid iteration id or snapshot id" };
        }
        const result = service.restoreSnapshot(iterationId, snapshotId);
        if (!result) {
            reply.code(404);
            return { message: "iteration or snapshot not found" };
        }
        return result;
    });
}
