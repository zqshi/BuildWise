import { getAccessToken } from "../auth/tokenStore";
import { ensureFreshToken } from "../auth/tokenRefresh";
import { readStoredAuthTenants, readStoredCurrentTenantId, resolveCurrentTenantId } from "../auth/tenantSession";

type RuntimeConfig = {
  apiRequestTimeoutMs: number;
  coachChatTimeoutMs: number;
  analysisJobTimeoutMs: number;
  pollIntervalMs: number;
  analysisQueuedStallTimeoutMs: number;
  analysisRunningStallTimeoutMs: number;
  pollMaxConsecutiveErrors: number;
  pollBackoffInitialMs: number;
  pollMaxBackoffMs: number;
  sessionMaxAgeSeconds: number;
};

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiRequestTimeoutMs: 30000,
  coachChatTimeoutMs: 180000,
  analysisJobTimeoutMs: 300000,
  pollIntervalMs: 3000,
  analysisQueuedStallTimeoutMs: 60000,
  analysisRunningStallTimeoutMs: 300000,
  pollMaxConsecutiveErrors: 5,
  pollBackoffInitialMs: 1000,
  pollMaxBackoffMs: 10000,
  sessionMaxAgeSeconds: 7200,
};

function readEnvInt(key: string): number | undefined {
  try {
    const raw = (import.meta as { env?: Record<string, string> }).env?.[key];
    if (raw == null || raw === "") return undefined;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : undefined;
  } catch {
    return undefined;
  }
}

let _cachedConfig: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (_cachedConfig) return _cachedConfig;
  const fromEnv: Partial<RuntimeConfig> = {
    apiRequestTimeoutMs: readEnvInt("VITE_API_REQUEST_TIMEOUT_MS"),
    coachChatTimeoutMs: readEnvInt("VITE_COACH_CHAT_TIMEOUT_MS"),
    analysisJobTimeoutMs: readEnvInt("VITE_ANALYSIS_JOB_TIMEOUT_MS"),
    pollIntervalMs: readEnvInt("VITE_POLL_INTERVAL_MS"),
    analysisQueuedStallTimeoutMs: readEnvInt("VITE_ANALYSIS_QUEUED_STALL_TIMEOUT_MS"),
    analysisRunningStallTimeoutMs: readEnvInt("VITE_ANALYSIS_RUNNING_STALL_TIMEOUT_MS"),
    pollMaxConsecutiveErrors: readEnvInt("VITE_POLL_MAX_CONSECUTIVE_ERRORS"),
    pollBackoffInitialMs: readEnvInt("VITE_POLL_BACKOFF_INITIAL_MS"),
    pollMaxBackoffMs: readEnvInt("VITE_POLL_MAX_BACKOFF_MS"),
    sessionMaxAgeSeconds: readEnvInt("VITE_SESSION_MAX_AGE_SECONDS"),
  };
  // 运行时全局覆盖（如有）优先于 Vite 环境变量
  const fromGlobal = (globalThis as { buildwiseRuntimeConfig?: Partial<RuntimeConfig> }).buildwiseRuntimeConfig;
  const merged: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  for (const key of Object.keys(merged) as (keyof RuntimeConfig)[]) {
    const globalVal = fromGlobal?.[key];
    const envVal = fromEnv[key];
    if (globalVal != null) {
      merged[key] = globalVal;
    } else if (envVal != null) {
      merged[key] = envVal;
    }
  }
  _cachedConfig = merged;
  return merged;
}

function getAuthUserId() {
  try {
    return localStorage.getItem("buildwise:auth-phone") || "";
  } catch {
    return "";
  }
}

function getAuthTenantId() {
  // v0.18.0 缺陷B治本: 注入 x-tenant-id 前过滤——tenantId 须在当前可访问租户列表内,
  // 否则 fallback 首个可访问租户或空(让后端按 userId 取自己租户),不发脏值。
  try {
    return resolveCurrentTenantId(readStoredAuthTenants(), readStoredCurrentTenantId());
  } catch {
    return "";
  }
}

function buildAuthHeaders(baseHeaders: HeadersInit | undefined, isAuthRoute: boolean): Headers {
  const headers = new Headers(baseHeaders);
  const authUserId = getAuthUserId();
  const authTenantId = getAuthTenantId();
  if (authUserId && !headers.has("x-user-id")) {
    headers.set("x-user-id", authUserId);
  }
  if (authTenantId && !headers.has("x-tenant-id")) {
    headers.set("x-tenant-id", authTenantId);
  }
  const freshToken = getAccessToken();
  if (freshToken && !isAuthRoute && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${freshToken}`);
  }
  return headers;
}

function buildMergedSignal(controller: AbortController, externalSignal?: AbortSignal | null): AbortSignal {
  if (!externalSignal) return controller.signal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([controller.signal, externalSignal]);
  }
  externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  return controller.signal;
}

function parseJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return Promise.resolve(null as T);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new Error("API error: invalid response format");
  return res.json() as Promise<T>;
}

async function handleRetry401(url: string, options: RequestInit | undefined, _isPublicRoute: boolean, timeoutMs: number | undefined): Promise<{ retryRes: Response | null }> {
  const freshToken = getAccessToken();
  if (!freshToken) return { retryRes: null };
  const refreshed = await ensureFreshToken();
  if (!refreshed) return { retryRes: null };
  const retryHeaders = buildAuthHeaders(options?.headers, false);
  const retryController = new AbortController();
  const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);
  try {
    const retryRes = await fetch(url, { ...options, headers: retryHeaders, credentials: "include", signal: retryController.signal });
    clearTimeout(retryTimeout);
    return { retryRes };
  } catch (retryError) {
    clearTimeout(retryTimeout);
    throw retryError;
  }
}

async function handleRetry429(url: string, mergedOptions: RequestInit, res: Response, timeoutMs: number | undefined): Promise<Response> {
  const retryAfter = Number.parseInt(res.headers.get("retry-after") || "5", 10);
  const waitMs = Math.min(Math.max(retryAfter, 2), 60) * 1000;
  await new Promise((r) => setTimeout(r, waitMs));
  const retryController = new AbortController();
  const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);
  try {
    const retryRes = await fetch(url, { ...mergedOptions, signal: retryController.signal });
    clearTimeout(retryTimeout);
    return retryRes;
  } catch (retryErr) {
    console.warn("[fetchJSON] 429 重试失败", retryErr);
    clearTimeout(retryTimeout);
    throw new Error("API error: too many requests, retry failed");
  }
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const ct = res.headers.get("content-type") || "";
  let detail = "";
  if (ct.includes("application/json")) {
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    detail = payload?.message ? `: ${payload.message}` : "";
  }
  throw new Error(`API error: ${res.status}${detail}`);
}

export async function fetchJSON<T>(url: string, options?: RequestInit, timeoutMs?: number): Promise<T> {
  const effectiveTimeout = timeoutMs ?? getRuntimeConfig().apiRequestTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);
  const isAuthRoute = url.includes("/api/v1/auth/");
  const isPublicRoute = url.includes("/api/v1/status") || url.includes("/api/v1/collab/share/");

  const token = getAccessToken();
  if (token && !isAuthRoute) await ensureFreshToken();

  const headers = buildAuthHeaders(options?.headers, isAuthRoute);
  const mergedSignal = buildMergedSignal(controller, options?.signal);
  const mergedOptions: RequestInit = { ...options, headers, credentials: "include", signal: mergedSignal };

  let res: Response;
  try {
    res = await fetch(url, mergedOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`API error: request timeout (${timeoutMs}ms)`);
    }
    const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
    throw new Error(`API error: network unavailable${detail}`);
  } finally {
    clearTimeout(timeout);
  }

  if (res.status === 401 && !isAuthRoute) {
    const { retryRes } = await handleRetry401(url, options, isPublicRoute, timeoutMs);
    if (retryRes?.ok) return parseJsonResponse<T>(retryRes);
    if (retryRes) res = retryRes;
    else if (!isPublicRoute) {
      window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
      throw new Error("API error: 401");
    }
  }

  if (res.status === 429) {
    const retryRes = await handleRetry429(url, mergedOptions, res, timeoutMs);
    if (retryRes.ok) return parseJsonResponse<T>(retryRes);
    res = retryRes;
  }

  if (res.status === 403 && !isAuthRoute) {
    // v0.18.0 缺陷B治本: 403 可能因 tenantId 与后端租户状态不同步,触发会话刷新拉最新 tenants 修正。
    window.dispatchEvent(new CustomEvent("buildwise:tenant-stale"));
  }

  await throwIfNotOk(res);
  return parseJsonResponse<T>(res);
}
