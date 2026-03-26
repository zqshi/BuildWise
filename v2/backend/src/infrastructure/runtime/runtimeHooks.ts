import type { FastifyInstance } from "fastify";
import type { RuntimeState } from "./runtimeState";
import type { RuntimeConfig } from "./runtimeConfig";
import { createLogger } from "./logger";
import { applyCorsResponseHeaders } from "./runtimeCors";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function registerRuntimeHooks(app: FastifyInstance, state: RuntimeState, config: RuntimeConfig) {
  const log = createLogger("http");
  app.addHook("onRequest", async (request, reply) => {
    state.onRequest(request, reply);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    applyCorsResponseHeaders(reply, request.headers.origin, config.corsOrigins);
    return payload;
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
    const errorMessage = toErrorMessage(error);
    const isKnown = errorMessage === "too many requests" || errorMessage === "service is shutting down";
    if (!isKnown && statusCode >= 500) {
      log.error("unhandled request error", { requestId: request.id, error: errorMessage });
    }
    const isDev = config.nodeEnv === "development";
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: statusCode >= 500 ? (isDev ? errorMessage : "Internal server error") : errorMessage,
      requestId: request.id
    });
  });
}
