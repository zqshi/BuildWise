import { API_BASE } from "../../app/workspaceApiCore";
import { getRefreshToken, saveTokens, clearTokens, isTokenExpiringSoon, getAccessToken } from "./tokenStore";

let refreshPromise: Promise<boolean> | null = null;

export async function ensureFreshToken(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) {
    return false;
  }
  if (!isTokenExpiringSoon()) {
    return true;
  }
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = doRefresh();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
    return false;
  }
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) {
      clearTokens();
      window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
      return false;
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
    saveTokens(data.accessToken, data.refreshToken, data.expiresIn);
    return true;
  } catch {
    clearTokens();
    window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
    return false;
  }
}
