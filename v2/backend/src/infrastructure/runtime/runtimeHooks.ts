import type { FastifyInstance } from "fastify";
import type { RuntimeState } from "./runtimeState";
import type { RuntimeConfig } from "./runtimeConfig";
import { createLogger } from "./logger";

export function registerRuntimeHooks(app: FastifyInstance, state: RuntimeState, config: RuntimeConfig) {
  const log = createLogger("http");
  app.addHook("onRequest", async (request, reply) => {
    state.onRequest(request, reply);
  });

  app.addHook("onResponse", async (request, reply) => {
    state.onResponse(request, reply);
    log.info("request completed", {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
      requestId: request.id,
      authSub: request.authSub || "-"
    });
  });

  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404);
    return {
      error: "not_found",
      message: `Route not found: ${request.method} ${request.routeOptions?.url || request.url.split("?")[0]}`,
      requestId: request.id
    };
  });

  app.setErrorHandler(async (error, request, reply) => {
    const statusCode = reply.statusCode >= 400 ? reply.statusCode : 500;
    const isKnown = error.message === "too many requests" || error.message === "service is shutting down";
    if (!isKnown && statusCode >= 500) {
      log.error("unhandled request error", { requestId: request.id, error: error.message });
    }
    const isDev = config.nodeEnv === "development";
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: statusCode >= 500 ? (isDev ? error.message : "Internal server error") : error.message,
      requestId: request.id
    });
  });
}
