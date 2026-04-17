import { API_BASE } from "../../shared/apiConfig";
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
      // 仅在服务端明确拒绝（401/403）时触发 auth-expired
      // 其他错误（502/503/网络波动）不应踢出用户，让 fetchJSON 的 401 处理器决定
      if (res.status === 401 || res.status === 403) {
        window.dispatchEvent(new CustomEvent("buildwise:auth-expired"));
      }
      return false;
    }
    const data = (await res.json()) as { accessToken: string; expiresIn: number };
    saveTokens(data.accessToken, data.expiresIn);
    return true;
  } catch (err) {
    console.warn("[tokenRefresh] refresh 请求失败", err);
    // 网络错误不清除 token，也不触发 auth-expired
    // 保留当前 token 尝试继续请求，由 fetchJSON 的 401 处理器最终决定
    return false;
  }
}
