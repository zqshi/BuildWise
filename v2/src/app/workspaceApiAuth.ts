import type { AuthTenantSummary } from "../infrastructure/auth/tenantSession";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export async function requestSmsLoginCode(phone: string) {
  // Do NOT use fetchJSON here — fetchJSON auto-retries 429 after a silent wait,
  // which is wrong for SMS requests. The user should see the countdown immediately.
  const res = await fetch(`${API_BASE}${API_PREFIX}/auth/sms/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ phone })
  });
  if (res.status === 429) {
    const retryAfter = Number.parseInt(res.headers.get("retry-after") || "60", 10);
    const payload = await res.json().catch(() => null) as { message?: string } | null;
    const detail = payload?.message || `retry-after=${retryAfter}`;
    throw new Error(detail);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || `API error: ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; expireAt: string; debugCode?: string };
}

export async function verifySmsLoginCode(phone: string, code: string) {
  return fetchJSON<{
    ok: boolean;
    user: {
      phone: string;
      platformRole: string;
      workspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer";
    };
    currentTenantId: string;
    tenants: AuthTenantSummary[];
    accessToken?: string;
    expiresIn?: number;
  }>(`${API_BASE}${API_PREFIX}/auth/sms/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code })
  });
}

export async function fetchAuthSession() {
  return fetchJSON<{
    ok: boolean;
    user: {
      phone: string;
      platformRole: string;
      workspaceRole: "owner" | "pm" | "developer" | "qa" | "viewer";
    };
    currentTenantId: string;
    tenants: AuthTenantSummary[];
  }>(`${API_BASE}${API_PREFIX}/auth/session`);
}

export async function logoutSession() {
  return fetch(`${API_BASE}${API_PREFIX}/auth/logout`, {
    method: "POST",
    credentials: "include"
  });
}
