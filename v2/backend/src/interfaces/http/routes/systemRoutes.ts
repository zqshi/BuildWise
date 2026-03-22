import type { FastifyInstance } from "fastify";
import type { RuntimeSnapshot } from "../../../infrastructure/runtime/runtimeState";

type SystemRouteContext = {
  serviceName: string;
  version: string;
  getRuntime: () => RuntimeSnapshot;
  isReady: () => boolean;
};

export async function registerSystemRoutes(app: FastifyInstance, context: SystemRouteContext) {
  app.get("/api/v1/status", async (request) => {
    const runtime = context.getRuntime();
    const isAuthenticated = request.authRole && request.authRole !== "viewer";
    return {
      status: runtime.shuttingDown ? "shutting_down" : "ok",
      service: context.serviceName,
      version: context.version,
      runtime: isAuthenticated
        ? runtime
        : {
            startedAt: runtime.startedAt,
            uptimeSec: runtime.uptimeSec,
            shuttingDown: runtime.shuttingDown,
            llmRequired: runtime.llmRequired,
            dependencyRequired: runtime.dependencyRequired,
            llm: { configured: runtime.llm.configured, reachable: runtime.llm.reachable },
            dependencies: { storage: { required: runtime.dependencies.storage.required, healthy: runtime.dependencies.storage.healthy } }
          }
    };
  });

  app.get("/health", async (_request, reply) => {
    const healthy = context.isReady();
    if (!healthy) {
      reply.code(503);
    }
    return { status: healthy ? "healthy" : "degraded" };
  });

  app.get("/ready", async (_request, reply) => {
    const runtime = context.getRuntime();
    if (!context.isReady()) {
      reply.code(503);
      const reason =
        runtime.dependencyRequired && !runtime.dependencies.storage.healthy
          ? "dependency_unhealthy"
          : runtime.llmRequired && !runtime.llm.reachable
            ? "llm_unreachable"
            : "service_unavailable";
      return { status: "not-ready", reason };
    }
    return { status: "ready" };
  });

  app.get("/api/v1/ops/runtime", async (request, reply) => {
    if (request.authRole === "viewer") {
      reply.code(403);
      return { message: "permission denied" };
    }
    return context.getRuntime();
  });
}
