// In-memory token storage — access token never touches localStorage (XSS mitigation).
// On page refresh the token is gone; the app re-acquires it via the httpOnly refresh cookie.
let _accessToken: string | null = null;
let _expireAt: number | null = null;

export function saveTokens(accessToken: string, expiresIn: number): void {
  _accessToken = accessToken;
  _expireAt = Date.now() + expiresIn * 1000;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearTokens(): void {
  _accessToken = null;
  _expireAt = null;
  // Clean up legacy localStorage keys if they still exist
  localStorage.removeItem("buildwise:access-token");
  localStorage.removeItem("buildwise:token-expire-at");
  localStorage.removeItem("buildwise:refresh-token");
}

export function isTokenExpiringSoon(bufferMs = 300000): boolean {
  if (_expireAt === null) {
    return true;
  }
  return Date.now() + bufferMs >= _expireAt;
}
