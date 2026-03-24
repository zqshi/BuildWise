import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { createBuildwiseApp } = await import("../dist/app.js");

test("createBuildwiseApp bootstraps a production app without binding a TCP port", async () => {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-app-bootstrap-"));
  const dataFile = path.join(fixtureDir, "data.runtime.json");
  const dbFile = path.join(fixtureDir, "workspace.db");
  writeFileSync(dataFile, JSON.stringify({ projects: [], iterations: [], messages: [] }, null, 2), "utf-8");

  const context = await createBuildwiseApp({
    env: {
      NODE_ENV: "production",
      AUTH_MODE: "jwt",
      JWT_SECRET: "12345678901234567890123456789012",
      STORAGE_BACKEND: "sqlite",
      WORKSPACE_DATA_FILE: dataFile,
      WORKSPACE_DB_FILE: dbFile,
      ALLOW_SEED_DATA_BOOTSTRAP: "false",
      LLM_REQUIRED: "false",
      CORS_ORIGINS: "http://127.0.0.1",
      BUILDWISE_PREFER_PROCESS_ENV: "1"
    },
    dataFile,
    registerProcessHandlers: false,
    scheduleWorkspaceRefresh: false,
    syncWorkspaceKnowledgeOnStart: false,
    probeLlmOnStart: false
  });

  try {
    await context.app.ready();
    const health = await context.app.inject({ method: "GET", url: "/health" });
    const ready = await context.app.inject({ method: "GET", url: "/ready" });
    assert.equal(health.statusCode, 200);
    assert.equal(ready.statusCode, 200);
    assert.equal(ready.json().status, "ready");
  } finally {
    await context.app.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
