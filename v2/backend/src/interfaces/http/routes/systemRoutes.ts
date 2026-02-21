import type { FastifyInstance } from "fastify";
import type { RuntimeSnapshot } from "../../../infrastructure/runtime/runtimeState";

type SystemRouteContext = {
  serviceName: string;
  version: string;
  getRuntime: () => RuntimeSnapshot;
  isReady: () => boolean;
};

export async function registerSystemRoutes(app: FastifyInstance, context: SystemRouteContext) {
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
      const reason =
        runtime.dependencyRequired && (!runtime.dependencies.modelFile.healthy || !runtime.dependencies.storage.healthy)
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
