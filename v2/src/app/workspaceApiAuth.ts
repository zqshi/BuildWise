import type { AuthTenantSummary } from "./authTenantSession";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { API_BASE, API_PREFIX } from "./workspaceApiCore";

export async function requestSmsLoginCode(phone: string) {
  return fetchJSON<{ ok: boolean; expireAt: string; debugCode?: string }>(`${API_BASE}${API_PREFIX}/auth/sms/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone })
  });
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
