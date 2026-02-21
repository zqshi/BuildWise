"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceProjectRoutes = registerWorkspaceProjectRoutes;
const workspaceRouteUtils_1 = require("./workspaceRouteUtils");
function registerWorkspaceProjectRoutes(app, service) {
    const validVersionTypes = new Set(["major", "minor", "patch"]);
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
    app.delete("/api/projects/:id", async (request, reply) => {
        const params = request.params;
        const projectId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const archived = service.archiveProject(projectId);
        if (!archived) {
            reply.code(404);
            return { message: "project not found" };
        }
        return {
            ok: true,
            projectId: archived.id,
            deletedAt: archived.deletedAt || ""
        };
    });
    app.get("/api/projects/:id/iterations", async (request, reply) => {
        const params = request.params;
        const projectId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
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
        const projectId = (0, workspaceRouteUtils_1.parsePositiveInt)(params.id);
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
        const versionType = body?.versionType?.trim().toLowerCase() || "patch";
        if (!validVersionTypes.has(versionType)) {
            reply.code(400);
            return { message: "versionType must be one of: major, minor, patch" };
        }
        const created = service.createIteration(projectId, {
            name,
            description: body?.description?.trim() || "暂无描述",
            versionType: versionType,
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
}
