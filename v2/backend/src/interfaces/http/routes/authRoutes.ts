import { randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WorkspaceService } from '../../../application/workspace/shared/workspaceService';
import type { RuntimeConfig } from "../../../infrastructure/runtime/runtimeConfig";
import { createTokenPair, verifyJwt, isTokenRevoked, revokeToken } from "../../../infrastructure/runtime/jwt";
import { createLogger } from "../../../infrastructure/runtime/logger";
import { currentTenantId } from "./workspaceRouteUtils";

const log = createLogger("auth");

const smsCodeStore = new Map<string, { code: string; expireAt: number; createdAt: number; failedAttempts: number }>();
const smsRateStore = new Map<string, number>();
const smsIpRateStore = new Map<string, { count: number; windowStart: number }>();
const SMS_CODE_MAX_AGE_MS = 10 * 60 * 1000;
const SMS_CODE_MAX_STORE_SIZE = 1000;
const SMS_RATE_LIMIT_MS = 60 * 1000;
const SMS_MAX_FAILED_ATTEMPTS = 5;
const SMS_IP_MAX_PER_WINDOW = 10;
const SMS_IP_WINDOW_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of smsCodeStore) { if (now - entry.createdAt > SMS_CODE_MAX_AGE_MS) smsCodeStore.delete(phone); }
  for (const [phone, timestamp] of smsRateStore) { if (now - timestamp > SMS_RATE_LIMIT_MS) smsRateStore.delete(phone); }
  for (const [ip, entry] of smsIpRateStore) { if (now - entry.windowStart > SMS_IP_WINDOW_MS) smsIpRateStore.delete(ip); }
}, 5 * 60 * 1000).unref();

function isValidPhone(phone: string) { return /^1\d{10}$/.test(phone); }

function replyWithRetryAfter(reply: FastifyReply, message: string, retryAfterSec: number) {
  reply.header("retry-after", String(Math.max(1, Math.ceil(retryAfterSec)))); reply.code(429);
  return { message };
}

function setRefreshTokenCookie(reply: FastifyReply, refreshToken: string, maxAgeSec: number, isSecure: boolean) {
  const parts = [`buildwise_rt=${refreshToken}`, "HttpOnly", "Path=/api/v1/auth", `Max-Age=${maxAgeSec}`, "SameSite=Strict"];
  if (isSecure) parts.push("Secure");
  reply.header("Set-Cookie", parts.join("; "));
}

function clearRefreshTokenCookie(reply: FastifyReply) {
  reply.header("Set-Cookie", "buildwise_rt=; HttpOnly; Path=/api/v1/auth; Max-Age=0; SameSite=Strict");
}

function parseRefreshTokenCookie(request: FastifyRequest): string {
  const raw = request.headers.cookie || "";
  const match = raw.match(/(?:^|;\s*)buildwise_rt=([^;]+)/);
  return match ? match[1].trim() : "";
}

function buildAuthSessionPayload(
  service: WorkspaceService, userId: string, platformRole: string,
  fallbackWorkspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer", requestedTenantId = ""
) {
  const tenants = service.project.listAccessibleTenants(userId);
  const resolvedTenantId = (requestedTenantId && tenants.some((t) => t.tenantId === requestedTenantId) ? requestedTenantId : "") || tenants[0]?.tenantId || userId;
  const currentTenant = tenants.find((t) => t.tenantId === resolvedTenantId) || null;
  return { ok: true, user: { phone: userId, platformRole, workspaceRole: currentTenant?.workspaceRole || fallbackWorkspaceRole }, currentTenantId: resolvedTenantId, tenants };
}

function isSecureRequest(config: RuntimeConfig, request: FastifyRequest) {
  return config.nodeEnv === "production" || request.protocol === "https" || request.headers["x-forwarded-proto"] === "https";
}

/* ── Route handlers ──────────────────────────────────────────────────── */

async function handleSmsRequest(config: RuntimeConfig, request: FastifyRequest, reply: FastifyReply) {
  const phone = ((request.body as { phone?: string } | null)?.phone || "").trim();
  if (!isValidPhone(phone)) { reply.code(400); return { message: "无效的手机号" }; }
  if (smsCodeStore.size >= SMS_CODE_MAX_STORE_SIZE) { reply.code(503); return { message: "验证码发送过于频繁，请稍后再试" }; }
  const clientIp = request.ip || "unknown";
  const ipEntry = smsIpRateStore.get(clientIp);
  const now = Date.now();
  if (ipEntry && now - ipEntry.windowStart < SMS_IP_WINDOW_MS) {
    if (ipEntry.count >= SMS_IP_MAX_PER_WINDOW) return replyWithRetryAfter(reply, "请求过于频繁，请稍后再试", (SMS_IP_WINDOW_MS - (now - ipEntry.windowStart)) / 1000);
    ipEntry.count += 1;
  } else {
    smsIpRateStore.set(clientIp, { count: 1, windowStart: now });
  }
  const lastSentAt = smsRateStore.get(phone);
  if (lastSentAt && now - lastSentAt < SMS_RATE_LIMIT_MS) return replyWithRetryAfter(reply, "请稍后再试，每60秒只能发送一次验证码", (SMS_RATE_LIMIT_MS - (now - lastSentAt)) / 1000);
  const code = `${randomInt(100000, 999999)}`;
  const expireAt = now + 5 * 60 * 1000;
  smsCodeStore.set(phone, { code, expireAt, createdAt: now, failedAttempts: 0 });
  smsRateStore.set(phone, now);
  return { ok: true, expireAt: new Date(expireAt).toISOString(), debugCode: config.nodeEnv === "development" && process.env.AUTH_DEBUG === "true" ? code : undefined };
}

function verifySmsCode(phone: string, code: string, reply: FastifyReply): boolean {
  const saved = smsCodeStore.get(phone);
  if (!saved || saved.expireAt < Date.now()) { reply.code(400); return false; }
  if (saved.failedAttempts >= SMS_MAX_FAILED_ATTEMPTS) { smsCodeStore.delete(phone); reply.code(429); return false; }
  const codeMatch = saved.code.length === code.length && timingSafeEqual(Buffer.from(saved.code), Buffer.from(code));
  if (!codeMatch) { saved.failedAttempts += 1; reply.code(400); return false; }
  smsCodeStore.delete(phone);
  return true;
}

async function handleSmsVerify(service: WorkspaceService, config: RuntimeConfig, request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as { phone?: string; code?: string } | null;
  const phone = (body?.phone || "").trim();
  const code = (body?.code || "").trim();
  if (!isValidPhone(phone) || !/^\d{6}$/.test(code)) { reply.code(400); return { message: "手机号或验证码无效" }; }
  if (!verifySmsCode(phone, code, reply)) {
    return { message: reply.statusCode === 429 ? "验证码已失效，失败次数过多，请重新获取" : "验证码无效或已过期" };
  }
  const binding = service.governance.listPlatformRoleBindings().find((item) => item.userId === phone);
  if (!binding) { reply.code(403); return { message: "该手机号未注册为平台成员" }; }
  const workspaceRole = service.governance.resolveWorkspaceRole(binding.role);
  if (config.authMode === "jwt") {
    const tokens = createTokenPair(phone, workspaceRole, config.jwtSecret, config.jwtAccessTtlSec, config.jwtRefreshTtlSec);
    log.info("jwt issued", { phone: `${phone.slice(0, 3)}****${phone.slice(7)}`, role: workspaceRole });
    setRefreshTokenCookie(reply, tokens.refreshToken, config.jwtRefreshTtlSec, isSecureRequest(config, request));
    return { ...buildAuthSessionPayload(service, phone, binding.role, workspaceRole), accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
  return buildAuthSessionPayload(service, phone, binding.role, workspaceRole);
}

async function handleGetSession(service: WorkspaceService, request: FastifyRequest, reply: FastifyReply) {
  const userId = request.authSub || "";
  if (!userId) { reply.code(401); return { message: "请先登录" }; }
  const binding = service.governance.listPlatformRoleBindings().find((item) => item.userId === userId);
  if (!binding) { reply.code(403); return { message: "该用户未注册为平台成员" }; }
  const workspaceRole = service.governance.resolveWorkspaceRole(binding.role);
  return buildAuthSessionPayload(service, userId, binding.role, workspaceRole, currentTenantId(request));
}

async function handleRefreshToken(service: WorkspaceService, config: RuntimeConfig, request: FastifyRequest, reply: FastifyReply) {
  if (config.authMode !== "jwt") {
    if (config.authMode === "off") return { accessToken: "dev-off-mode-token", expiresIn: 86400 };
    reply.code(404); return { message: "仅在 JWT 认证模式下可刷新令牌" };
  }
  const refreshToken = parseRefreshTokenCookie(request);
  if (!refreshToken) { reply.code(400); return { message: "缺少刷新令牌" }; }
  if (isTokenRevoked(refreshToken)) { clearRefreshTokenCookie(reply); reply.code(401); return { message: "刷新令牌已被撤销" }; }
  let payload;
  try { payload = verifyJwt(refreshToken, config.jwtSecret); }
  catch { clearRefreshTokenCookie(reply); reply.code(401); return { message: "刷新令牌无效或已过期" }; }
  if (payload.type !== "refresh") { clearRefreshTokenCookie(reply); reply.code(401); return { message: "无效的令牌类型" }; }
  const binding = service.governance.listPlatformRoleBindings().find((item) => item.userId === payload.sub);
  if (!binding) { clearRefreshTokenCookie(reply); reply.code(403); return { message: "用户已不再注册" }; }
  revokeToken(refreshToken, payload.exp);
  const latestRole = service.governance.resolveWorkspaceRole(binding.role);
  const tokens = createTokenPair(payload.sub, latestRole, config.jwtSecret, config.jwtAccessTtlSec, config.jwtRefreshTtlSec);
  log.info("jwt refreshed", { sub: `${payload.sub.slice(0, 3)}****${payload.sub.slice(7)}`, role: latestRole });
  setRefreshTokenCookie(reply, tokens.refreshToken, config.jwtRefreshTtlSec, isSecureRequest(config, request));
  return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
}

async function handleLogout(config: RuntimeConfig, request: FastifyRequest, reply: FastifyReply) {
  const refreshToken = parseRefreshTokenCookie(request);
  if (refreshToken && config.authMode === "jwt") {
    try { const payload = verifyJwt(refreshToken, config.jwtSecret); revokeToken(refreshToken, payload.exp); } catch { /* already invalid */ }
  }
  clearRefreshTokenCookie(reply);
  return { ok: true };
}

/* ── Route registration ──────────────────────────────────────────────── */

export function registerAuthRoutes(app: FastifyInstance, service: WorkspaceService, config: RuntimeConfig) {
  app.post("/auth/sms/request", {
    schema: { body: { type: "object", required: ["phone"], properties: { phone: { type: "string", pattern: "^1\\d{10}$" } }, additionalProperties: false } }
  }, (req, rep) => handleSmsRequest(config, req, rep));

  app.post("/auth/sms/verify", {
    schema: { body: { type: "object", required: ["phone", "code"], properties: { phone: { type: "string", pattern: "^1\\d{10}$" }, code: { type: "string", pattern: "^\\d{6}$" } }, additionalProperties: false } }
  }, (req, rep) => handleSmsVerify(service, config, req, rep));

  app.get("/auth/session", (req, rep) => handleGetSession(service, req, rep));
  app.post("/auth/refresh", (req, rep) => handleRefreshToken(service, config, req, rep));
  app.post("/auth/logout", (req, rep) => handleLogout(config, req, rep));
}
