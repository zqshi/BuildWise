import type { FastifyCorsOptions } from "@fastify/cors";
import type { FastifyReply } from "fastify";

const DEFAULT_DEV_CORS_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173"
];

function resolveAllowedOrigins(corsOrigins: string[] | true) {
  return corsOrigins === true ? DEFAULT_DEV_CORS_ORIGINS : corsOrigins;
}

export function resolveCorsOriginOption(corsOrigins: string[] | true): FastifyCorsOptions["origin"] {
  return resolveAllowedOrigins(corsOrigins);
}

export function applyCorsResponseHeaders(
  reply: FastifyReply,
  requestOrigin: string | undefined,
  corsOrigins: string[] | true
) {
  if (!requestOrigin) {
    return;
  }
  const allowedOrigins = resolveAllowedOrigins(corsOrigins);
  if (!allowedOrigins.includes(requestOrigin)) {
    return;
  }
  reply.header("vary", "Origin");
  reply.header("access-control-allow-origin", requestOrigin);
  reply.header("access-control-allow-credentials", "true");
}
