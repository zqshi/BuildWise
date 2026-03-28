import { getAccessToken } from "../auth/tokenStore";
import { ensureFreshToken } from "../auth/tokenRefresh";

function getAuthUserId() {
  try {
    return localStorage.getItem("buildwise:auth-phone") || "";
  } catch {
    return "";
  }
}

function getAuthTenantId() {
  try {
    return localStorage.getItem("buildwise:auth-tenant-id") || "";
  } catch {
    return "";
  }
}

export async function fetchJSON<T>(url: string, options?: RequestInit, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // 如果有 token 且不是认证路由，确保 token 新鲜并注入 Bearer header
  const isAuthRoute = url.includes("/api/v1/auth/");
  const isPublicRoute = url.includes("/api/v1/status") || url.includes("/api/v1/collab/share/");
  const token = getAccessToken();
  if (token && !isAuthRoute) {
    await ensureFreshToken();
  }

  const headers = new Headers(options?.headers);
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

  // 合并 timeout signal 和调用方 signal — 兼容不支持 AbortSignal.any 的浏览器
  let mergedSignal: AbortSignal;
  if (options?.signal) {
    if (typeof AbortSignal.any === "function") {
      mergedSignal = AbortSignal.any([controller.signal, options.signal]);
    } else {
      // fallback: 任一 signal abort 时触发 controller.abort
      const onExternalAbort = () => controller.abort();
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
      mergedSignal = controller.signal;
    }
  } else {
    mergedSignal = controller.signal;
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
    signal: mergedSignal
  };
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

  // 401 自动重试：尝试刷新 token 后重试一次
  if (res.status === 401 && !isAuthRoute) {
    if (freshToken) {
      const refreshed = await ensureFreshToken();
      if (refreshed) {
        const retryToken = getAccessToken();
        const retryHeaders = new Headers(options?.headers);
        if (authUserId && !retryHeaders.has("x-user-id")) {
          retryHeaders.set("x-user-id", authUserId);
        }
        if (authTenantId && !retryHeaders.has("x-tenant-id")) {
          retryHeaders.set("x-tenant-id", authTenantId);
        }
        if (retryToken) {
          retryHeaders.set("Authorization", `Bearer ${retryToken}`);
        }
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);
        try {
          const retryRes = await fetch(url, { ...options, headers: retryHeaders, credentials: "include", signal: retryController.signal });
          clearTimeout(retryTimeout);
          if (retryRes.ok) {
            if (retryRes.status === 204) {
              return null as T;
            }
            const contentType = retryRes.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
              throw new Error("API error: invalid response format");
            }
            return (await retryRes.json()) as T;
          }
          // 重试仍然失败，走正常错误处理
          res = retryRes;
        } catch (retryError) {
          clearTimeout(retryTimeout);
          throw retryError;
        }
      }
    }
    // 无 token 或 refresh 失败 → 触发 auth-expired，让用户重新登录
    if (!isPublicRoute) {
      window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
      throw new Error("API error: 401");
    }
  }

  // 429 Too Many Requests — 等待 retry-after 后自动重试一次，避免触发 recovery 风暴
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get("retry-after") || "5", 10);
    const waitMs = Math.min(Math.max(retryAfter, 2), 60) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    const retryController = new AbortController();
    const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);
    try {
      const retryRes = await fetch(url, { ...mergedOptions, signal: retryController.signal });
      clearTimeout(retryTimeout);
      if (retryRes.ok) {
        if (retryRes.status === 204) return null as T;
        const ct = retryRes.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error("API error: invalid response format");
        return (await retryRes.json()) as T;
      }
      // 重试后仍失败，走下面的通用错误处理
      res = retryRes;
    } catch {
      clearTimeout(retryTimeout);
      throw new Error("API error: too many requests, retry failed");
    }
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let detail = "";
    if (contentType.includes("application/json")) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      detail = payload?.message ? `: ${payload.message}` : "";
    }
    throw new Error(`API error: ${res.status}${detail}`);
  }
  // 204 No Content — 无 body，直接返回 null
  if (res.status === 204) {
    return null as T;
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API error: invalid response format");
  }
  return (await res.json()) as T;
}
