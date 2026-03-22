import { API_BASE } from "../../app/workspaceApiCore";
import { saveTokens, clearTokens, isTokenExpiringSoon, getAccessToken } from "./tokenStore";

let refreshPromise: Promise<boolean> | null = null;

export async function ensureFreshToken(): Promise<boolean> {
  const token = getAccessToken();
  // If we have a valid, non-expiring token, no work needed
  if (token && !isTokenExpiringSoon()) {
    return true;
  }
  // No token in memory (e.g. page refresh) or token expiring soon — attempt refresh via httpOnly cookie
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
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) {
      clearTokens();
      window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
      return false;
    }
    const data = (await res.json()) as { accessToken: string; expiresIn: number };
    saveTokens(data.accessToken, data.expiresIn);
    return true;
  } catch {
    clearTokens();
    window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
    return false;
  }
}
