import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeConfig } from "./runtimeConfig";

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
    const role = raw.trim().toLowerCase();
    if (role === "owner") {
      console.warn("[runtimeAuth] x-role=owner 在 authMode=off 下被降级为 editor");
      return "editor";
    }
    return role;
  }
  return "viewer";
}

function unauthorized(reply: FastifyReply, message: string) {
  reply.code(401);
  return reply.send({ error: "unauthorized", message });
}

export function registerRuntimeAuth(app: FastifyInstance, config: RuntimeConfig) {
  if (config.authMode === "off") {
    console.warn("[runtimeAuth] AUTH_MODE=off: 认证已禁用，默认角色为 viewer。生产环境请配置 AUTH_MODE=token");
  }

  app.addHook("onRequest", async (request, reply) => {
    const path = toPath(request.url);
    if (config.authMode === "off") {
      request.authRole = devRoleFromHeader(request);
      return;
    }

    if (isPublicPath(path, config.authPublicPathPrefixes)) {
      request.authRole = "viewer";
      return;
    }

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

