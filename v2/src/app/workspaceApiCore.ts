const rawApiBase = import.meta.env.VITE_API_BASE || "";

export const API_BASE = rawApiBase.endsWith("/api") ? rawApiBase.slice(0, -4) : rawApiBase;

export const API_PREFIX = "/api/v1";

export function isApiNotFound(error: unknown) {
  return error instanceof Error && /^API error: 404\b/.test(error.message);
}
