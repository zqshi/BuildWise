const rawApiBase =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE || "";

export function normalizeApiBase(apiBase: string) {
  return apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
}

export function shouldUseSameOriginProxy(currentOrigin: string, apiBase: string) {
  if (!apiBase || !currentOrigin) {
    return false;
  }
  try {
    const current = new URL(currentOrigin);
    const target = new URL(apiBase, current.origin);
    const localHosts = new Set(["127.0.0.1", "localhost"]);
    return (
      localHosts.has(current.hostname) &&
      localHosts.has(target.hostname) &&
      current.hostname === target.hostname &&
      current.origin !== target.origin
    );
  } catch {
    return false;
  }
}

const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;

export const API_BASE = shouldUseSameOriginProxy(currentOrigin, rawApiBase) ? "" : normalizeApiBase(rawApiBase);

export const API_PREFIX = "/api/v1";

export function isApiNotFound(error: unknown) {
  return error instanceof Error && /^API error: 404\b/.test(error.message);
}
