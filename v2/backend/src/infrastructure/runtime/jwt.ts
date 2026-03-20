import { createHmac, timingSafeEqual } from "node:crypto";

export type JwtPayload = {
  sub: string;
  role: string;
  type: "access" | "refresh";
  iat: number;
  exp: number;
};

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

// --------------- Revoked-token store (pluggable) ---------------

export interface RevokedTokenStore {
  revoke(token: string, expiresAt: number): void;
  isRevoked(token: string): boolean;
}

/** Default in-memory store — used when no persistent store is injected. */
class MemoryRevokedTokenStore implements RevokedTokenStore {
  private readonly map = new Map<string, number>();
  revoke(token: string, expiresAt: number): void {
    this.map.set(token, expiresAt);
    const now = Math.floor(Date.now() / 1000);
    if (this.map.size > 200) {
      for (const [t, exp] of this.map) {
        if (exp <= now) this.map.delete(t);
      }
    }
  }
  isRevoked(token: string): boolean {
    const exp = this.map.get(token);
    if (exp === undefined) return false;
    const now = Math.floor(Date.now() / 1000);
    if (exp <= now) {
      this.map.delete(token);
      return false;
    }
    return true;
  }
}

let revokedStore: RevokedTokenStore = new MemoryRevokedTokenStore();

/** Inject a persistent revoked-token store (call once at startup). */
export function setRevokedTokenStore(store: RevokedTokenStore): void {
  revokedStore = store;
}

export function revokeToken(token: string, expiresAt: number): void {
  revokedStore.revoke(token, expiresAt);
}

export function isTokenRevoked(token: string): boolean {
  return revokedStore.isRevoked(token);
}

function toBase64Url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signJwt(payload: Omit<JwtPayload, "iat">, secret: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = { ...payload, iat };
  const payloadB64 = toBase64Url(JSON.stringify(fullPayload));
  const data = `${HEADER_B64}.${payloadB64}`;
  const signature = sign(data, secret);
  return `${data}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("jwt_malformed");
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  if (headerB64 !== HEADER_B64) {
    throw new Error("jwt_invalid_header");
  }
  const data = `${headerB64}.${payloadB64}`;
  const expected = sign(data, secret);
  const sigBuf = Buffer.from(signatureB64, "base64url");
  const expBuf = Buffer.from(expected, "base64url");
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("jwt_invalid_signature");
  }
  let payload: JwtPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadB64)) as JwtPayload;
  } catch {
    throw new Error("jwt_invalid_payload");
  }
  if (typeof payload.sub !== "string" || typeof payload.role !== "string" || typeof payload.exp !== "number") {
    throw new Error("jwt_invalid_payload");
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("jwt_expired");
  }
  return payload;
}

export function createTokenPair(
  sub: string,
  role: string,
  secret: string,
  accessTtlSec: number,
  refreshTtlSec: number
): { accessToken: string; refreshToken: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({ sub, role, type: "access", exp: now + accessTtlSec }, secret);
  const refreshToken = signJwt({ sub, role, type: "refresh", exp: now + refreshTtlSec }, secret);
  return { accessToken, refreshToken, expiresIn: accessTtlSec };
}
