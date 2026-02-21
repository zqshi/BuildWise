"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRepositoryTraceRoutes = registerRepositoryTraceRoutes;
function parsePositiveInt(value) {
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : null;
}
async function registerRepositoryTraceRoutes(app, service) {
    app.get("/api/projects/:id/repository", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const repo = service.getProjectRepository(projectId);
        if (!repo) {
            reply.code(404);
            return { message: "project not found" };
        }
        return repo;
    });
    app.post("/api/projects/:id/repository/bootstrap", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const body = request.body;
        const repo = service.bootstrapProjectRepository(projectId, {
            provider: body?.provider,
            organization: body?.organization,
            name: body?.name,
            url: body?.url,
            defaultBranch: body?.defaultBranch
        });
        if (!repo) {
            reply.code(404);
            return { message: "project not found" };
        }
        return repo;
    });
    app.post("/api/projects/:id/repository/provision", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const body = request.body;
        const result = await service.provisionProjectRepository(projectId, {
            ownerType: body?.ownerType,
            organization: body?.organization,
            name: body?.name,
            defaultBranch: body?.defaultBranch,
            visibility: body?.visibility,
            autoInit: body?.autoInit,
            dryRun: body?.dryRun
        });
        if (!result.ok) {
            if (result.reason === "project_not_found") {
                reply.code(404);
                return { message: "project not found" };
            }
            if (result.reason === "provider_not_supported") {
                reply.code(400);
                return { message: "provider not supported" };
            }
            reply.code(502);
            return { message: result.message || "repository provision failed" };
        }
        return result.data;
    });
    app.post("/api/projects/:id/repository/scaffold", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const body = request.body;
        const result = service.scaffoldProjectRepository(projectId, {
            rootDir: body?.rootDir,
            initializeGit: body?.initializeGit,
            createInitialCommit: body?.createInitialCommit,
            dryRun: body?.dryRun
        });
        if (!result.ok) {
            if (result.reason === "project_not_found") {
                reply.code(404);
                return { message: "project not found" };
            }
            reply.code(500);
            return { message: result.message || "repository scaffold failed" };
        }
        return result.data;
    });
    app.post("/api/iterations/:id/publish", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const result = await service.publishIterationToRemote(iterationId, {
            commitMessage: body?.commitMessage,
            openPr: body?.openPr,
            prTitle: body?.prTitle,
            prBody: body?.prBody,
            dryRun: body?.dryRun
        });
        if (!result.ok) {
            if (result.reason === "iteration_not_found") {
                reply.code(404);
                return { message: "iteration not found" };
            }
            if (result.reason === "repository_not_scaffolded") {
                reply.code(409);
                return { message: "repository not scaffolded" };
            }
            if (result.reason === "analysis_confirmation_required") {
                reply.code(409);
                return { message: "analysis confirmation required" };
            }
            if (result.reason === "release_review_blocked") {
                reply.code(409);
                return { message: result.message || "release review blocked", blockers: result.blockers || [] };
            }
            reply.code(502);
            return { message: result.message || "iteration publish failed" };
        }
        return result.data;
    });
    app.post("/api/iterations/:id/code-link", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const body = request.body;
        const linked = service.bindIterationCodeLink(iterationId, {
            branch: body?.branch,
            tag: body?.tag,
            commit: body?.commit,
            pr: body?.pr,
            paths: body?.paths,
            note: body?.note
        });
        if (!linked) {
            reply.code(404);
            return { message: "iteration not found" };
        }
        return linked;
    });
    app.get("/api/iterations/:id/code-link", async (request, reply) => {
        const params = request.params;
        const iterationId = parsePositiveInt(params.id);
        if (iterationId === null) {
            reply.code(400);
            return { message: "invalid iteration id" };
        }
        const codeLink = service.getIterationCodeLink(iterationId);
        if (!codeLink) {
            reply.code(404);
            return { message: "code link not found" };
        }
        return codeLink;
    });
    app.get("/api/projects/:id/code-trace", async (request, reply) => {
        const params = request.params;
        const projectId = parsePositiveInt(params.id);
        if (projectId === null) {
            reply.code(400);
            return { message: "invalid project id" };
        }
        const query = request.query;
        const ref = query?.ref?.trim() || "";
        if (!ref) {
            reply.code(400);
            return { message: "ref is required" };
        }
        if (!service.hasProject(projectId)) {
            reply.code(404);
            return { message: "project not found" };
        }
        return {
            projectId,
            ref,
            matches: service.locateIterationsByCodeRef(projectId, ref)
        };
    });
}
