import type { FastifyInstance } from "fastify";
import type { RuntimeState } from "./runtimeState";

export function registerRuntimeHooks(app: FastifyInstance, state: RuntimeState) {
  app.addHook("onRequest", async (request, reply) => {
    state.onRequest(request, reply);
  });

  app.addHook("onResponse", async (request, reply) => {
    state.onResponse(request, reply);
  });

  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404);
    return {
      error: "not_found",
      message: `Route not found: ${request.method} ${request.url}`,
      requestId: request.id
    };
  });

  app.setErrorHandler(async (error, request, reply) => {
    const statusCode = reply.statusCode >= 400 ? reply.statusCode : 500;
    const isKnown = error.message === "too many requests" || error.message === "service is shutting down";
    if (!isKnown && statusCode >= 500) {
      console.error("Unhandled request error", { requestId: request.id, error: error.message });
    }
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: statusCode >= 500 ? "Internal server error" : error.message,
      requestId: request.id
    });
  });
}
