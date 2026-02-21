"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlatformRoutes = registerPlatformRoutes;
const platformSupport_1 = require("../../../application/platform/platformSupport");
function parsePositiveInt(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : null;
}
function currentRole(authRole) {
    return authRole?.trim().toLowerCase() || "viewer";
}
function ensurePermission(authRole, permission) {
    const role = currentRole(authRole);
    if (!(0, platformSupport_1.hasPermission)(role, permission)) {
        return { ok: false, role };
    }
    return { ok: true, role };
}
async function registerPlatformRoutes(app, service) {
    app.get("/api/collab/snapshots", async (request, reply) => {
        const query = request.query;
        const projectId = parsePositiveInt(query?.projectId);
        if (projectId === null) {
            reply.code(400);
            return { message: "projectId is required" };
        }
        return service.listVersionSnapshots(projectId);
    });
    app.post("/api/collab/snapshots", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "collab:write");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const body = request.body;
        const projectId = typeof body?.projectId === "number" ? body.projectId : null;
        const iterationId = typeof body?.iterationId === "number" ? body.iterationId : null;
        const name = body?.name?.trim();
        if (!projectId || !iterationId || !name) {
            reply.code(400);
            return { message: "projectId, iterationId and name are required" };
        }
        const created = service.createVersionSnapshot(projectId, iterationId, name, body?.note?.trim() || "");
        if (!created) {
            reply.code(404);
            return { message: "project or iteration not found" };
        }
        return created;
    });
    app.post("/api/collab/snapshots/:id/restore", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "collab:write");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const params = request.params;
        const snapshotId = parsePositiveInt(params.id);
        if (snapshotId === null) {
            reply.code(400);
            return { message: "invalid snapshot id" };
        }
        const result = service.restoreVersionSnapshot(snapshotId);
        if (!result) {
            reply.code(404);
            return { message: "snapshot not found" };
        }
        return result;
    });
    app.get("/api/collab/shares", async (request, reply) => {
        const query = request.query;
        const projectId = parsePositiveInt(query?.projectId);
        if (projectId === null) {
            reply.code(400);
            return { message: "projectId is required" };
        }
        return service.listProjectShares(projectId);
    });
    app.post("/api/collab/shares", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "collab:write");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const body = request.body;
        const projectId = typeof body?.projectId === "number" ? body.projectId : null;
        if (!projectId || !body?.permission) {
            reply.code(400);
            return { message: "projectId and permission are required" };
        }
        const ttlHours = typeof body.ttlHours === "number" && body.ttlHours > 0 ? Math.floor(body.ttlHours) : 72;
        const created = service.createProjectShare(projectId, body.permission, ttlHours);
        if (!created) {
            reply.code(404);
            return { message: "project not found" };
        }
        return created;
    });
    app.get("/api/templates", async () => {
        return service.listTemplates();
    });
    app.post("/api/templates/:id/run", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "template:run");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const params = request.params;
        const body = request.body;
        const projectId = typeof body?.projectId === "number" ? body.projectId : null;
        if (!projectId) {
            reply.code(400);
            return { message: "projectId is required" };
        }
        const result = service.runTemplateWithParams(params.id, projectId, body?.parameters || {});
        if (!result) {
            reply.code(404);
            return { message: "template or project not found" };
        }
        return result;
    });
    app.get("/api/templates/runs", async (request) => {
        const query = request.query;
        const projectId = parsePositiveInt(query?.projectId ?? "");
        return service.listTemplateRuns(projectId || undefined);
    });
    app.get("/api/collab/share/:token", async (request, reply) => {
        const params = request.params;
        const access = service.accessShare(params.token);
        if (!access.ok) {
            reply.code(access.reason === "share_expired" ? 410 : 404);
            return { message: access.reason };
        }
        return access.data;
    });
    app.post("/api/collab/share/:token/comments", async (request, reply) => {
        const params = request.params;
        const body = request.body;
        const content = body?.content?.trim() || "";
        if (!content) {
            reply.code(400);
            return { message: "content is required" };
        }
        const result = service.commentByShare(params.token, content);
        if (!result.ok) {
            if (result.reason === "permission_denied") {
                reply.code(403);
            }
            else if (result.reason === "share_expired") {
                reply.code(410);
            }
            else {
                reply.code(404);
            }
            return { message: result.reason };
        }
        return result.data;
    });
    app.get("/api/openapi/export", async () => {
        return service.exportOpenApi();
    });
    app.get("/api/ops/deployments", async (request) => {
        const query = request.query;
        const projectId = parsePositiveInt(query?.projectId ?? "");
        return service.listDeployments(projectId || undefined);
    });
    app.post("/api/ops/deployments", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "deploy:write");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const body = request.body;
        const projectId = typeof body?.projectId === "number" ? body.projectId : null;
        const iterationId = typeof body?.iterationId === "number" ? body.iterationId : undefined;
        const environment = body?.environment;
        const version = body?.version?.trim();
        if (!projectId || !environment || !version) {
            reply.code(400);
            return { message: "projectId, environment and version are required" };
        }
        if (!["staging", "production"].includes(environment)) {
            reply.code(400);
            return { message: "invalid environment" };
        }
        const created = service.createDeployment(projectId, environment, version, iterationId);
        if (!created) {
            reply.code(404);
            return { message: "project not found" };
        }
        return created;
    });
    app.post("/api/ops/deployments/:id/transition", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "deploy:transition");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const params = request.params;
        const body = request.body;
        const deploymentId = parsePositiveInt(params.id);
        if (!deploymentId || !body?.toStatus) {
            reply.code(400);
            return { message: "deployment id and toStatus are required" };
        }
        const result = service.transitionDeployment(deploymentId, body.toStatus);
        if (!result.ok) {
            if (result.reason === "deployment_not_found") {
                reply.code(404);
                return { message: "deployment not found" };
            }
            reply.code(409);
            return { message: "invalid deployment transition" };
        }
        return result.data;
    });
    app.get("/api/ops/metrics", async () => {
        return service.getOpsMetrics();
    });
    app.get("/api/ops/triage-templates", async (request) => {
        const query = request.query;
        const projectId = parsePositiveInt(query?.projectId ?? "");
        return service.listOpsTriageTemplatesByProject(projectId || undefined);
    });
    app.post("/api/ops/triage-templates", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "deploy:write");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const body = request.body;
        const category = body?.category?.trim() || "general";
        const keywords = Array.isArray(body?.keywords) ? body.keywords : [];
        const commands = Array.isArray(body?.commands) ? body.commands : [];
        const result = service.upsertOpsTriageTemplate({
            id: body?.id,
            projectId: typeof body?.projectId === "number" ? body.projectId : undefined,
            category,
            keywords,
            commands,
            note: body?.note
        });
        if (!result.ok) {
            reply.code(400);
            return { message: "invalid template payload" };
        }
        return result.data;
    });
    app.delete("/api/ops/triage-templates/:id", async (request, reply) => {
        const permit = ensurePermission(request.authRole, "deploy:write");
        if (!permit.ok) {
            reply.code(403);
            return { message: `permission denied for role ${permit.role}` };
        }
        const params = request.params;
        const templateId = params.id?.trim();
        if (!templateId) {
            reply.code(400);
            return { message: "template id is required" };
        }
        const result = service.deleteOpsTriageTemplate(templateId);
        if (!result.ok) {
            reply.code(404);
            return { message: "template not found" };
        }
        return { ok: true };
    });
}
