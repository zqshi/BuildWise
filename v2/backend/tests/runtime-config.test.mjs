import test from "node:test";
import assert from "node:assert/strict";

const { loadRuntimeConfig } = await import("../dist/infrastructure/runtime/runtimeConfig.js");

test("json storage backend silently falls back to sqlite", () => {
  const config = loadRuntimeConfig(
    {
      NODE_ENV: "development",
      STORAGE_BACKEND: "json"
    },
    { dataFile: "/tmp/buildwise.json" }
  );
  assert.equal(config.storageBackend, "sqlite");
});

test("required public paths are always preserved", () => {
  const config = loadRuntimeConfig(
    {
      NODE_ENV: "development",
      AUTH_MODE: "jwt",
      JWT_SECRET: "12345678901234567890123456789012",
      AUTH_PUBLIC_PATH_PREFIXES: "/health,/custom-open"
    },
    { dataFile: "/tmp/buildwise.json" }
  );

  assert.equal(config.authPublicPathPrefixes.includes("/api/v1/status"), true);
  assert.equal(config.authPublicPathPrefixes.includes("/api/v1/ops/metrics"), true);
  assert.equal(config.authPublicPathPrefixes.includes("/custom-open"), true);
});

test("sqlite defaults workspace db file from explicit workspace data file", () => {
  const config = loadRuntimeConfig(
    {
      NODE_ENV: "development",
      STORAGE_BACKEND: "sqlite",
      WORKSPACE_DATA_FILE: "/tmp/contract-fixture.json"
    },
    { dataFile: "/tmp/default.runtime.json" }
  );

  assert.equal(config.dataFile, "/tmp/contract-fixture.json");
  assert.equal(config.workspaceDbFile, "/tmp/contract-fixture.db");
});
