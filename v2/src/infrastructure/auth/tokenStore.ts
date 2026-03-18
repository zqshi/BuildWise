const ACCESS_TOKEN_KEY = "buildwise:access-token";
const REFRESH_TOKEN_KEY = "buildwise:refresh-token";
const EXPIRE_AT_KEY = "buildwise:token-expire-at";

export function saveTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(EXPIRE_AT_KEY, String(Date.now() + expiresIn * 1000));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRE_AT_KEY);
}

export function isTokenExpiringSoon(bufferMs = 300000): boolean {
  const expireAt = localStorage.getItem(EXPIRE_AT_KEY);
  if (!expireAt) {
    return true;
  }
  return Date.now() + bufferMs >= Number(expireAt);
}
