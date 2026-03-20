import { randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { WorkspaceService } from "../../../application/workspace/workspaceService";
import type { RuntimeConfig } from "../../../infrastructure/runtime/runtimeConfig";
import { createTokenPair, verifyJwt, isTokenRevoked, revokeToken } from "../../../infrastructure/runtime/jwt";
import { createLogger } from "../../../infrastructure/runtime/logger";

const log = createLogger("auth");

const smsCodeStore = new Map<string, { code: string; expireAt: number; createdAt: number; failedAttempts: number }>();
const smsRateStore = new Map<string, number>();
const SMS_CODE_MAX_AGE_MS = 10 * 60 * 1000;
const SMS_CODE_MAX_STORE_SIZE = 1000;
const SMS_RATE_LIMIT_MS = 60 * 1000;
const SMS_MAX_FAILED_ATTEMPTS = 5;

setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of smsCodeStore) {
    if (now - entry.createdAt > SMS_CODE_MAX_AGE_MS) {
      smsCodeStore.delete(phone);
    }
  }
}, 5 * 60 * 1000).unref();

function isValidPhone(phone: string) {
  return /^1\d{10}$/.test(phone);
}

export function registerAuthRoutes(app: FastifyInstance, service: WorkspaceService, config: RuntimeConfig) {
  // POST /api/auth/sms/request
  app.post("/auth/sms/request", async (request, reply) => {
    const body = request.body as { phone?: string } | null;
    const phone = (body?.phone || "").trim();
    if (!isValidPhone(phone)) {
      reply.code(400);
      return { message: "invalid phone" };
    }
    if (smsCodeStore.size >= SMS_CODE_MAX_STORE_SIZE) {
      reply.code(503);
      return { message: "sms code store is full, please try later" };
    }
    const lastSentAt = smsRateStore.get(phone);
    const now = Date.now();
    if (lastSentAt && now - lastSentAt < SMS_RATE_LIMIT_MS) {
      reply.code(429);
      return { message: "请稍后再试，每60秒只能发送一次验证码" };
    }
    const code = `${randomInt(100000, 999999)}`;
    const expireAt = now + 5 * 60 * 1000;
    smsCodeStore.set(phone, { code, expireAt, createdAt: now, failedAttempts: 0 });
    smsRateStore.set(phone, now);
    return { ok: true, expireAt: new Date(expireAt).toISOString(), debugCode: config.nodeEnv === "development" ? code : undefined };
  });

  // POST /api/auth/sms/verify
  app.post("/auth/sms/verify", async (request, reply) => {
    const body = request.body as { phone?: string; code?: string } | null;
    const phone = (body?.phone || "").trim();
    const code = (body?.code || "").trim();
    if (!isValidPhone(phone) || !/^\d{6}$/.test(code)) {
      reply.code(400);
      return { message: "invalid phone or code" };
    }
    const saved = smsCodeStore.get(phone);
    if (!saved || saved.expireAt < Date.now()) {
      reply.code(400);
      return { message: "invalid or expired code" };
    }
    if (saved.failedAttempts >= SMS_MAX_FAILED_ATTEMPTS) {
      smsCodeStore.delete(phone);
      reply.code(429);
      return { message: "验证码已失效，失败次数过多，请重新获取" };
    }
    const codeMatch = saved.code.length === code.length && timingSafeEqual(Buffer.from(saved.code), Buffer.from(code));
    if (!codeMatch) {
      saved.failedAttempts += 1;
      reply.code(400);
      return { message: "invalid or expired code" };
    }
    smsCodeStore.delete(phone);
    const binding = service.listPlatformRoleBindings().find((item) => item.userId === phone);
    if (!binding) {
      reply.code(403);
      return { message: "phone is not registered in platform members" };
    }
    const workspaceRole = service.resolveWorkspaceRole(binding.role);

    // JWT 模式：签发 token 对
    if (config.authMode === "jwt") {
      const tokens = createTokenPair(phone, workspaceRole, config.jwtSecret, config.jwtAccessTtlSec, config.jwtRefreshTtlSec);
      log.info("jwt issued", { phone: phone.slice(0, 3) + "****" + phone.slice(7), role: workspaceRole });
      return {
        ok: true,
        user: { phone, platformRole: binding.role, workspaceRole },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn
      };
    }

    // 非 JWT 模式（off/token）：原有行为
    return {
      ok: true,
      user: {
        phone,
        platformRole: binding.role,
        workspaceRole
      }
    };
  });

  // POST /api/auth/refresh — 刷新 token
  app.post("/auth/refresh", async (request, reply) => {
    if (config.authMode !== "jwt") {
      reply.code(404);
      return { message: "token refresh is only available in jwt auth mode" };
    }
    const body = request.body as { refreshToken?: string } | null;
    const refreshToken = (body?.refreshToken || "").trim();
    if (!refreshToken) {
      reply.code(400);
      return { message: "missing refreshToken" };
    }
    if (isTokenRevoked(refreshToken)) {
      reply.code(401);
      return { message: "refresh token has been revoked" };
    }
    let payload;
    try {
      payload = verifyJwt(refreshToken, config.jwtSecret);
    } catch {
      reply.code(401);
      return { message: "invalid or expired refresh token" };
    }
    if (payload.type !== "refresh") {
      reply.code(401);
      return { message: "invalid token type" };
    }
    // 重新查 platformRoleBindings 确认用户仍然存在
    const binding = service.listPlatformRoleBindings().find((item) => item.userId === payload.sub);
    if (!binding) {
      reply.code(403);
      return { message: "user no longer registered" };
    }
    // Revoke the old refresh token (rotation)
    revokeToken(refreshToken, payload.exp);
    const latestRole = service.resolveWorkspaceRole(binding.role);
    const tokens = createTokenPair(payload.sub, latestRole, config.jwtSecret, config.jwtAccessTtlSec, config.jwtRefreshTtlSec);
    log.info("jwt refreshed", { sub: payload.sub.slice(0, 3) + "****" + payload.sub.slice(7), role: latestRole });
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    };
  });
}
