"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAutobootRoutes = registerAutobootRoutes;
function normalizeMethod(value) {
    const method = value.toUpperCase();
    if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        return method;
    }
    return "GET";
}
async function registerAutobootRoutes(app, service) {
    app.get("/api/model", async () => {
        return service.getModel();
    });
    app.get("/api/model/entities", async () => {
        return service.listEntities();
    });
    app.post("/api/model/entities", async (request, reply) => {
        const body = request.body;
        const name = body?.name?.trim();
        if (!name) {
            reply.code(400);
            return { message: "name is required" };
        }
        return service.createEntity({
            name,
            businessLabel: body?.businessLabel?.trim(),
            fields: body?.fields
        });
    });
    app.get("/api/model/relations", async () => {
        return service.listRelations();
    });
    app.post("/api/model/relations", async (request, reply) => {
        const body = request.body;
        const fromEntityId = body?.fromEntityId?.trim();
        const toEntityId = body?.toEntityId?.trim();
        const type = body?.type;
        if (!fromEntityId || !toEntityId || !type) {
            reply.code(400);
            return { message: "fromEntityId, toEntityId and type are required" };
        }
        if (!["one_to_one", "one_to_many", "many_to_many"].includes(type)) {
            reply.code(400);
            return { message: "invalid relation type" };
        }
        const created = service.createRelation({
            fromEntityId,
            toEntityId,
            type,
            name: body?.name?.trim()
        });
        if (!created.ok) {
            if (created.reason === "entity_not_found") {
                reply.code(404);
                return { message: "entity not found" };
            }
            if (created.reason === "relation_duplicated") {
                reply.code(409);
                return { message: "relation already exists" };
            }
            reply.code(400);
            return { message: "relation create failed" };
        }
        return created.value;
    });
    app.delete("/api/model/relations/:id", async (request, reply) => {
        const params = request.params;
        const relationId = params.id?.trim();
        if (!relationId) {
            reply.code(400);
            return { message: "invalid relation id" };
        }
        const ok = service.deleteRelation(relationId);
        if (!ok) {
            reply.code(404);
            return { message: "relation not found" };
        }
        return { ok: true, id: relationId };
    });
    app.get("/api/rules/compile", async () => {
        return service.compileRules();
    });
    app.get("/api/rules/bind", async () => {
        return service.bindRules();
    });
    app.get("/api/sync/report", async () => {
        return service.buildSyncReport();
    });
    app.get("/api/trace", async () => {
        return service.buildTraceReport();
    });
    app.get("/api/trace/map", async () => {
        return service.buildTraceReport();
    });
    const roadmapPaths = [
        "/api/roadmap-v0-1",
        "/api/roadmap-v0-2",
        "/api/roadmap-v0-3",
        "/api/roadmap-v0-4",
        "/api/roadmap-v0-5",
        "/api/roadmap-v0-6",
        "/api/roadmap-v0-7",
        "/api/roadmap-v0-8",
        "/api/roadmap-v0-9",
        "/api/roadmap-v1-0",
        "/api/roadmap-v1-1",
        "/api/roadmap-v1-2"
    ];
    for (const path of roadmapPaths) {
        app.get(path, async (request, reply) => {
            const roadmap = service.describeRoadmap(path);
            if (!roadmap) {
                reply.code(404);
                return { message: "roadmap not found" };
            }
            return roadmap;
        });
    }
    const apis = service.listRoutes();
    const reserved = new Set([
        "/api/model",
        "/api/model/entities",
        "/api/model/relations",
        "/api/rules/compile",
        "/api/rules/bind",
        "/api/sync/report",
        "/api/trace",
        "/api/trace/map"
    ]);
    for (const api of apis) {
        const path = typeof api.path === "string" ? api.path : "";
        if (!path) {
            continue;
        }
        const method = normalizeMethod(api.method ?? "GET");
        // Keep core workspace routes authoritative.
        if (reserved.has(path) ||
            path === "/api/projects" ||
            path.startsWith("/api/projects/:id/iterations") ||
            path.startsWith("/api/iterations/")) {
            continue;
        }
        const key = `${method} ${path}`;
        if (app.hasRoute({ method, url: path })) {
            continue;
        }
        app.route({
            method,
            url: path,
            handler: async () => {
                if (method === "GET" && path.startsWith("/api/roadmap-v")) {
                    const roadmap = service.describeRoadmap(path);
                    if (roadmap) {
                        return roadmap;
                    }
                }
                return { ok: true, route: key };
            }
        });
    }
    // AUTOboot:APIS:END
}
