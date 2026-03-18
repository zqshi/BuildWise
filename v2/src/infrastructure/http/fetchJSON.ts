import { getAccessToken } from "../auth/tokenStore";
import { ensureFreshToken } from "../auth/tokenRefresh";

export async function fetchJSON<T>(url: string, options?: RequestInit, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // 如果有 token 且不是认证路由，确保 token 新鲜并注入 Bearer header
  const isAuthRoute = url.includes("/api/auth/");
  const token = getAccessToken();
  if (token && !isAuthRoute) {
    await ensureFreshToken();
  }

  const headers = new Headers(options?.headers);
  const freshToken = getAccessToken();
  if (freshToken && !isAuthRoute && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${freshToken}`);
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
    signal: options?.signal ?? controller.signal
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
  if (res.status === 401 && freshToken && !isAuthRoute) {
    const refreshed = await ensureFreshToken();
    if (refreshed) {
      const retryToken = getAccessToken();
      const retryHeaders = new Headers(options?.headers);
      if (retryToken) {
        retryHeaders.set("Authorization", `Bearer ${retryToken}`);
      }
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);
      try {
        const retryRes = await fetch(url, { ...options, headers: retryHeaders, signal: retryController.signal });
        clearTimeout(retryTimeout);
        if (retryRes.ok) {
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

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let detail = "";
    if (contentType.includes("application/json")) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      detail = payload?.message ? `: ${payload.message}` : "";
    }
    throw new Error(`API error: ${res.status}${detail}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API error: invalid response format");
  }
  return (await res.json()) as T;
}
