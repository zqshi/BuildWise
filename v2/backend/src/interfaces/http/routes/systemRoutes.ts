import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildPrometheusMetrics } from "../../../infrastructure/runtime/prometheusMetrics";
import type { RuntimeSnapshot } from "../../../infrastructure/runtime/runtimeState";
import { getLlmCallStats } from "../../../infrastructure/llm/agentRunnerFactory";

type SystemRouteContext = {
  serviceName: string;
  version: string;
  getRuntime: () => RuntimeSnapshot;
  getOpsMetrics: () => { generatedAt: string; metrics: Array<{ name: string; value: number; unit: string }>; latestAuditAt: string };
  isReady: () => boolean;
};

export async function registerSystemRoutes(app: FastifyInstance, context: SystemRouteContext) {
  app.get("/api/v1/status", async (req) => handleStatus(context, req));
  app.get("/health", async (_req, reply) => handleHealth(context, reply));
  app.get("/ready", async (_req, reply) => handleReady(context, reply));
  app.get("/metrics", async (_req, reply) => handleMetrics(context, reply));
  app.get("/api/v1/ops/metrics/prometheus", async (_req, reply) => handleMetrics(context, reply));
  app.get("/api/v1/ops/runtime", async (req, reply) => handleRuntime(context, req, reply));
  app.get("/api/v1/ops/llm-stats", async (req, reply) => handleLlmStats(req, reply));
}

function handleStatus(context: SystemRouteContext, request: FastifyRequest) {
  const runtime = context.getRuntime();
  const isAuthenticated = request.authRole && request.authRole !== "viewer";
  return {
    status: runtime.shuttingDown ? "shutting_down" : "ok",
    service: context.serviceName, version: context.version,
    runtime: isAuthenticated ? runtime : {
      startedAt: runtime.startedAt, uptimeSec: runtime.uptimeSec, shuttingDown: runtime.shuttingDown,
      llmRequired: runtime.llmRequired, dependencyRequired: runtime.dependencyRequired,
      llm: { configured: runtime.llm.configured, reachable: runtime.llm.reachable },
      dependencies: { storage: { required: runtime.dependencies.storage.required, healthy: runtime.dependencies.storage.healthy } },
      requests: { inFlight: runtime.requests.inFlight, rateLimited: runtime.requests.rateLimited, avgLatencyMs: runtime.requests.avgLatencyMs },
    },
  };
}

function handleHealth(context: SystemRouteContext, reply: FastifyReply) {
  const runtime = context.getRuntime();
  if (runtime.shuttingDown) { reply.code(503); return { status: "shutting_down" }; }
  return { status: "healthy" };
}

function handleReady(context: SystemRouteContext, reply: FastifyReply) {
  const runtime = context.getRuntime();
  if (!context.isReady()) {
    reply.code(503);
    const reason = runtime.dependencyRequired && !runtime.dependencies.storage.healthy ? "dependency_unhealthy"
      : runtime.llmRequired && !runtime.llm.reachable ? "llm_unreachable" : "service_unavailable";
    return { status: "not-ready", reason };
  }
  return { status: "ready" };
}

function handleMetrics(context: SystemRouteContext, reply: FastifyReply) {
  reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
  return buildPrometheusMetrics(context.getRuntime(), context.getOpsMetrics(), context.isReady());
}

function handleRuntime(context: SystemRouteContext, request: FastifyRequest, reply: FastifyReply) {
  if (request.authRole === "viewer") { reply.code(403); return { message: "没有权限" }; }
  return context.getRuntime();
}

function handleLlmStats(request: FastifyRequest, reply: FastifyReply) {
  if (request.authRole === "viewer") { reply.code(403); return { message: "没有权限" }; }
  const query = request.query as { limit?: string } | null;
  const limit = Math.min(Math.max(Number(query?.limit) || 50, 1), 200);
  return getLlmCallStats(limit);
}
