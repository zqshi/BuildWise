"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSystemRoutes = registerSystemRoutes;
async function registerSystemRoutes(app, context) {
    app.get("/api/status", async () => {
        return {
            status: "ok",
            service: context.serviceName,
            version: context.version,
            runtime: context.getRuntime()
        };
    });
    app.get("/health", async () => {
        return {
            status: context.isReady() ? "healthy" : "degraded",
            runtime: context.getRuntime()
        };
    });
    app.get("/ready", async (_request, reply) => {
        const runtime = context.getRuntime();
        if (!context.isReady()) {
            reply.code(503);
            const reason = runtime.dependencyRequired && (!runtime.dependencies.modelFile.healthy || !runtime.dependencies.storage.healthy)
                ? "dependency_unhealthy"
                : runtime.llmRequired && !runtime.llm.reachable
                    ? "llm_unreachable"
                    : "service_unavailable";
            return { status: "not-ready", reason, runtime };
        }
        return { status: "ready", runtime };
    });
    app.get("/api/ops/runtime", async () => {
        return context.getRuntime();
    });
}
