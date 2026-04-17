import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "./runtimeConfig";
import { createLogger } from "./logger";
import { verifyJwt, isTokenRevoked } from "./jwt";

function toPath(url: string) {
  const index = url.indexOf("?");
  return index >= 0 ? url.slice(0, index) : url;
}

function isPublicPath(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

function parseBearerToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const raw = value.trim();
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return raw.slice(7).trim();
}

function devRoleFromHeader(request: FastifyRequest) {
  const raw = request.headers["x-role"];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase();
  }
  return "viewer";
}

function devUserFromHeader(request: FastifyRequest) {
  const raw = request.headers["x-user-id"];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return "";
}

function tenantFromHeader(request: FastifyRequest) {
  const raw = request.headers["x-tenant-id"];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return "";
}

function unauthorized(reply: FastifyReply, message: string) {
  reply.code(401);
  return reply.send({ error: "unauthorized", message });
}

function handleJwtAuth(request: FastifyRequest, reply: FastifyReply, config: RuntimeConfig, log: ReturnType<typeof createLogger>) {
  const token = parseBearerToken(request.headers.authorization);
  if (!token) return unauthorized(reply, "missing bearer token");
  if (isTokenRevoked(token)) return unauthorized(reply, "token has been revoked");
  try {
    const payload = verifyJwt(token, config.jwtSecret);
    if (payload.type !== "access") return unauthorized(reply, "invalid token type");
    request.authRole = payload.role;
    request.authSub = payload.sub;
    const jwtTenant = typeof payload.tenantId === "string" ? payload.tenantId : "";
    const headerTenant = tenantFromHeader(request);
    if (jwtTenant && headerTenant && jwtTenant !== headerTenant) {
      log.warn(`Tenant mismatch: header=${headerTenant}, jwt=${jwtTenant} — using jwt`);
    }
    request.authTenantId = jwtTenant || headerTenant;
  } catch {
    return unauthorized(reply, "invalid or expired token");
  }
}

function handleTokenAuth(request: FastifyRequest, reply: FastifyReply, config: RuntimeConfig) {
  const token = parseBearerToken(request.headers.authorization);
  if (!token) return unauthorized(reply, "missing bearer token");
  const role = config.authTokens[token];
  if (!role) return unauthorized(reply, "invalid bearer token");
  request.authRole = role;
  request.authSub = devUserFromHeader(request);
  request.authTenantId = tenantFromHeader(request);
}

export function registerRuntimeAuth(app: FastifyInstance, config: RuntimeConfig) {
  const log = createLogger("auth");
  if (config.authMode === "off") {
    log.warn("AUTH_MODE=off: authentication disabled, default role is owner");
  }

  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const path = toPath(request.url);

    if (config.authMode === "off") {
      request.authRole = devRoleFromHeader(request) === "viewer" && !request.headers["x-role"] ? "owner" : devRoleFromHeader(request);
      request.authSub = devUserFromHeader(request) || "dev-user";
      request.authTenantId = tenantFromHeader(request) || "";
      return;
    }

    if (isPublicPath(path, config.authPublicPathPrefixes)) {
      request.authRole = "viewer";
      return;
    }

    if (config.authMode === "jwt") return handleJwtAuth(request, reply, config, log);
    return handleTokenAuth(request, reply, config);
  });
}
