type EnvMap = Record<string, string | undefined>;

export type RuntimeConfig = {
  serviceName: string;
  version: string;
  host: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  corsOrigins: string[] | true;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  shutdownTimeoutMs: number;
  authMode: "off" | "token" | "jwt";
  jwtSecret: string;
  jwtAccessTtlSec: number;
  jwtRefreshTtlSec: number;
  authTokens: Record<string, string>;
  authPublicPathPrefixes: string[];
  llmRequired: boolean;
  dependencyRequired: boolean;
  storageBackend: "json" | "sqlite";
  workspaceDbFile: string;
  dataFile: string;
  modelFile: string;
  openclawHome: string;
  homeDir: string;
  openclawSkillsEnabled: boolean;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

function parsePort(value: string | undefined, fallback: number) {
  const num = parsePositiveInt(value, fallback);
  if (num < 1 || num > 65535) {
    return fallback;
  }
  return num;
}

function parseNodeEnv(value: string | undefined): RuntimeConfig["nodeEnv"] {
  if (value === "production" || value === "test") {
    return value;
  }
  return "development";
}

function parseCorsOrigins(value: string | undefined): string[] | true {
  const raw = value?.trim();
  if (!raw || raw === "*") {
    return true;
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseAuthMode(value: string | undefined): "off" | "token" | "jwt" {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "token") return "token";
  if (normalized === "jwt") return "jwt";
  return "off";
}

function parseAuthTokens(value: string | undefined): Record<string, string> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [token, role] of Object.entries(parsed)) {
      if (!token.trim() || typeof role !== "string" || !role.trim()) {
        continue;
      }
      result[token.trim()] = role.trim().toLowerCase();
    }
    return result;
  } catch {
    return {};
  }
}

function parsePathPrefixes(value: string | undefined, fallback: string[]): string[] {
  if (!value?.trim()) {
    return fallback;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStorageBackend(value: string | undefined): "json" | "sqlite" {
  return value?.trim().toLowerCase() === "sqlite" ? "sqlite" : "json";
}

function parseBool(value: string | undefined, fallback = false) {
  if (!value?.trim()) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function loadRuntimeConfig(env: EnvMap, defaults: { dataFile: string; modelFile: string }): RuntimeConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  const authMode = parseAuthMode(env.AUTH_MODE);
  const authTokens = parseAuthTokens(env.AUTH_TOKENS_JSON);
  const authPublicPathPrefixes = parsePathPrefixes(env.AUTH_PUBLIC_PATH_PREFIXES, [
    "/health",
    "/ready",
    "/api/v1/status",
    "/api/v1/collab/share/",
    "/api/v1/auth/"
  ]);
  const storageBackend = parseStorageBackend(env.STORAGE_BACKEND);
  if (nodeEnv !== "development" && corsOrigins === true) {
    throw new Error("CORS_ORIGINS must be explicitly configured in non-development environments");
  }
  if (nodeEnv === "production" && authMode === "off") {
    throw new Error(`AUTH_MODE must be 'token' or 'jwt' in production (current: '${authMode}')`);
  }
  if (authMode === "token" && Object.keys(authTokens).length === 0) {
    throw new Error("AUTH_MODE=token requires AUTH_TOKENS_JSON");
  }
  if (authMode === "token" && nodeEnv === "production") {
    const hasPlaceholder = Object.keys(authTokens).some((key) => key.includes("change-me"));
    if (hasPlaceholder) {
      throw new Error("AUTH_TOKENS_JSON contains placeholder 'change-me' tokens — replace them before deploying to production");
    }
  }
  if (authMode === "jwt") {
    const secret = (env.JWT_SECRET || "").trim();
    if (secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters when AUTH_MODE=jwt");
    }
  }

  return {
    serviceName: env.SERVICE_NAME?.trim() || "buildwise-v2-backend",
    version: env.SERVICE_VERSION?.trim() || "0.1.0",
    host: env.HOST?.trim() || "127.0.0.1",
    port: parsePort(env.PORT, 5055),
    nodeEnv,
    corsOrigins,
    rateLimitWindowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: parsePositiveInt(env.RATE_LIMIT_MAX, 200),
    shutdownTimeoutMs: parsePositiveInt(env.SHUTDOWN_TIMEOUT_MS, 10_000),
    authMode,
    authTokens,
    authPublicPathPrefixes,
    llmRequired: parseBool(env.LLM_REQUIRED, false),
    dependencyRequired: parseBool(env.DEPENDENCY_REQUIRED, nodeEnv === "production"),
    storageBackend,
    workspaceDbFile: env.WORKSPACE_DB_FILE?.trim() || defaults.dataFile.replace(/\.json$/i, ".db"),
    jwtSecret: (env.JWT_SECRET || "").trim(),
    jwtAccessTtlSec: parsePositiveInt(env.JWT_ACCESS_TTL_SEC, 7200),
    jwtRefreshTtlSec: parsePositiveInt(env.JWT_REFRESH_TTL_SEC, 604800),
    dataFile: env.WORKSPACE_DATA_FILE?.trim() || defaults.dataFile,
    modelFile: env.MODEL_FILE?.trim() || defaults.modelFile,
    openclawHome: env.OPENCLAW_HOME?.trim() || "",
    homeDir: env.HOME?.trim() || "",
    openclawSkillsEnabled: parseBool(env.BUILDWISE_OPENCLAW_SKILLS_ENABLED, false)
  };
}
