import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerSystemRoutes } = await import("../dist/interfaces/http/routes/systemRoutes.js");

test("AUTH_MODE=off falls back to viewer when x-role is absent", async () => {
  const app = Fastify();
  registerRuntimeAuth(app, {
    authMode: "off",
    authPublicPathPrefixes: [],
    authTokens: {}
  });
  app.get("/role", async (request) => ({ authRole: request.authRole || "" }));

  const response = await app.inject({ method: "GET", url: "/role" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().authRole, "viewer");

  await app.close();
});

test("AUTH_MODE=off still honors explicit x-role override", async () => {
  const app = Fastify();
  registerRuntimeAuth(app, {
    authMode: "off",
    authPublicPathPrefixes: [],
    authTokens: {}
  });
  app.get("/role", async (request) => ({ authRole: request.authRole || "" }));

  const response = await app.inject({ method: "GET", url: "/role", headers: { "x-role": "owner" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().authRole, "owner");

  await app.close();
});

test("/health stays healthy when dependencies are degraded but process is alive", async () => {
  const app = Fastify();
  await registerSystemRoutes(app, {
    serviceName: "buildwise-test",
    version: "0.0.0",
    isReady: () => false,
    getRuntime: () => ({
      startedAt: "2026-01-01T00:00:00.000Z",
      uptimeSec: 1,
      shuttingDown: false,
      llmRequired: true,
      dependencyRequired: true,
      llm: {
        configured: true,
        reachable: false,
        baseUrl: "https://example.invalid",
        model: "test-model",
        checkedAt: "2026-01-01T00:00:00.000Z",
        error: "timeout"
      },
      dependencies: {
        storage: {
          required: true,
          healthy: false,
          checkedAt: "2026-01-01T00:00:00.000Z",
          detail: "missing"
        }
      },
      requests: {
        inFlight: 0,
        total: 0,
        errors: 0,
        rateLimited: 0,
        avgLatencyMs: 0
      }
    })
  });

  const health = await app.inject({ method: "GET", url: "/health" });
  const ready = await app.inject({ method: "GET", url: "/ready" });

  assert.equal(health.statusCode, 200);
  assert.equal(health.json().status, "healthy");
  assert.equal(ready.statusCode, 503);
  assert.equal(ready.json().status, "not-ready");
  assert.equal(ready.json().reason, "dependency_unhealthy");

  await app.close();
});

test("/health returns 503 only while shutting down", async () => {
  const app = Fastify();
  await registerSystemRoutes(app, {
    serviceName: "buildwise-test",
    version: "0.0.0",
    isReady: () => false,
    getRuntime: () => ({
      startedAt: "2026-01-01T00:00:00.000Z",
      uptimeSec: 1,
      shuttingDown: true,
      llmRequired: false,
      dependencyRequired: false,
      llm: {
        configured: false,
        reachable: false,
        baseUrl: "",
        model: "test-model",
        checkedAt: "",
        error: ""
      },
      dependencies: {
        storage: {
          required: false,
          healthy: true,
          checkedAt: "",
          detail: "ok"
        }
      },
      requests: {
        inFlight: 0,
        total: 0,
        errors: 0,
        rateLimited: 0,
        avgLatencyMs: 0
      }
    })
  });

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, "shutting_down");

  await app.close();
});
