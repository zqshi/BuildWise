const rawApiBase = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5055";

export const API_BASE = rawApiBase.endsWith("/api") ? rawApiBase.slice(0, -4) : rawApiBase;

export function isApiNotFound(error: unknown) {
  return error instanceof Error && /^API error: 404\b/.test(error.message);
}
