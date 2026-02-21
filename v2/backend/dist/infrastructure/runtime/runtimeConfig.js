"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRuntimeConfig = loadRuntimeConfig;
function parsePositiveInt(value, fallback) {
    if (!value) {
        return fallback;
    }
    const num = Number(value);
    return Number.isInteger(num) && num > 0 ? num : fallback;
}
function parsePort(value, fallback) {
    const num = parsePositiveInt(value, fallback);
    if (num < 1 || num > 65535) {
        return fallback;
    }
    return num;
}
function parseNodeEnv(value) {
    if (value === "production" || value === "test") {
        return value;
    }
    return "development";
}
function parseCorsOrigins(value) {
    const raw = value?.trim();
    if (!raw || raw === "*") {
        return true;
    }
    return raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function parseAuthMode(value) {
    return value?.trim().toLowerCase() === "token" ? "token" : "off";
}
function parseAuthTokens(value) {
    if (!value?.trim()) {
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        const result = {};
        for (const [token, role] of Object.entries(parsed)) {
            if (!token.trim() || typeof role !== "string" || !role.trim()) {
                continue;
            }
            result[token.trim()] = role.trim().toLowerCase();
        }
        return result;
    }
    catch {
        return {};
    }
}
function parsePathPrefixes(value, fallback) {
    if (!value?.trim()) {
        return fallback;
    }
    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}
function parseStorageBackend(value) {
    return value?.trim().toLowerCase() === "sqlite" ? "sqlite" : "json";
}
function parseBool(value, fallback = false) {
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
function loadRuntimeConfig(env, defaults) {
    const nodeEnv = parseNodeEnv(env.NODE_ENV);
    const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
    const authMode = parseAuthMode(env.AUTH_MODE);
    const authTokens = parseAuthTokens(env.AUTH_TOKENS_JSON);
    const authPublicPathPrefixes = parsePathPrefixes(env.AUTH_PUBLIC_PATH_PREFIXES, [
        "/health",
        "/ready",
        "/api/status",
        "/api/collab/share/"
    ]);
    const storageBackend = parseStorageBackend(env.STORAGE_BACKEND);
    if (nodeEnv === "production" && corsOrigins === true) {
        throw new Error("CORS_ORIGINS must be explicitly configured in production");
    }
    if (authMode === "token" && Object.keys(authTokens).length === 0) {
        throw new Error("AUTH_MODE=token requires AUTH_TOKENS_JSON");
    }
    return {
        serviceName: env.SERVICE_NAME?.trim() || "buildwise-v2-backend",
        version: env.SERVICE_VERSION?.trim() || "0.1.0",
        host: env.HOST?.trim() || "127.0.0.1",
        port: parsePort(env.PORT, 5055),
        nodeEnv,
        corsOrigins,
        rateLimitWindowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, 60000),
        rateLimitMax: parsePositiveInt(env.RATE_LIMIT_MAX, 2000),
        shutdownTimeoutMs: parsePositiveInt(env.SHUTDOWN_TIMEOUT_MS, 10000),
        authMode,
        authTokens,
        authPublicPathPrefixes,
        llmRequired: parseBool(env.LLM_REQUIRED, false),
        dependencyRequired: parseBool(env.DEPENDENCY_REQUIRED, nodeEnv === "production"),
        storageBackend,
        workspaceDbFile: env.WORKSPACE_DB_FILE?.trim() || defaults.dataFile.replace(/\.json$/i, ".db"),
        dataFile: env.WORKSPACE_DATA_FILE?.trim() || defaults.dataFile,
        modelFile: env.MODEL_FILE?.trim() || defaults.modelFile
    };
}
