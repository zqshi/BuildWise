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
  return "owner";
}

function unauthorized(reply: FastifyReply, message: string) {
  reply.code(401);
  return reply.send({ error: "unauthorized", message });
}

export function registerRuntimeAuth(app: FastifyInstance, config: RuntimeConfig) {
  const log = createLogger("auth");
  if (config.authMode === "off") {
    log.warn("AUTH_MODE=off: authentication disabled, default role is viewer");
  }

  app.addHook("onRequest", async (request, reply) => {
    // CORS preflight 必须在 auth 之前放行
    if (request.method === "OPTIONS") {
      return;
    }

    const path = toPath(request.url);

    if (config.authMode === "off") {
      request.authRole = devRoleFromHeader(request);
      return;
    }

    // 公开路径直接放行（token 和 jwt 模式共用）
    if (isPublicPath(path, config.authPublicPathPrefixes)) {
      request.authRole = "viewer";
      return;
    }

    if (config.authMode === "jwt") {
      const token = parseBearerToken(request.headers.authorization);
      if (!token) {
        return unauthorized(reply, "missing bearer token");
      }
      if (isTokenRevoked(token)) {
        return unauthorized(reply, "token has been revoked");
      }
      try {
        const payload = verifyJwt(token, config.jwtSecret);
        if (payload.type !== "access") {
          return unauthorized(reply, "invalid token type");
        }
        request.authRole = payload.role;
        request.authSub = payload.sub;
      } catch {
        return unauthorized(reply, "invalid or expired token");
      }
      return;
    }

    // token 模式（原有逻辑）
    const token = parseBearerToken(request.headers.authorization);
    if (!token) {
      return unauthorized(reply, "missing bearer token");
    }
    const role = config.authTokens[token];
    if (!role) {
      return unauthorized(reply, "invalid bearer token");
    }
    request.authRole = role;
  });
}

