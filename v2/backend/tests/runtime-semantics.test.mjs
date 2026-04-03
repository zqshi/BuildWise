import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerSystemRoutes } = await import("../dist/interfaces/http/routes/systemRoutes.js");
const { currentUserId, currentTenantId } = await import("../dist/interfaces/http/routes/workspaceRouteUtils.js");

test("AUTH_MODE=off falls back to owner when x-role is absent", async () => {
  const app = Fastify();
  registerRuntimeAuth(app, {
    authMode: "off",
    authPublicPathPrefixes: [],
    authTokens: {}
  });
  app.get("/role", async (request) => ({ authRole: request.authRole || "" }));

  const response = await app.inject({ method: "GET", url: "/role" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().authRole, "owner");

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
    getOpsMetrics: () => ({ generatedAt: "", latestAuditAt: "", metrics: [] }),
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
    getOpsMetrics: () => ({ generatedAt: "", latestAuditAt: "", metrics: [] }),
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

test("/api/v1/status exposes safe runtime request aggregates on public access", async () => {
  const app = Fastify();
  registerRuntimeAuth(app, {
    authMode: "jwt",
    authPublicPathPrefixes: ["/api/v1/status"],
    authTokens: {},
    jwtSecret: "12345678901234567890123456789012"
  });
  await registerSystemRoutes(app, {
    serviceName: "buildwise-test",
    version: "0.0.0",
    isReady: () => true,
    getOpsMetrics: () => ({ generatedAt: "", latestAuditAt: "", metrics: [] }),
    getRuntime: () => ({
      startedAt: "2026-01-01T00:00:00.000Z",
      uptimeSec: 12,
      shuttingDown: false,
      llmRequired: true,
      dependencyRequired: true,
      llm: {
        configured: true,
        reachable: true,
        baseUrl: "https://example.invalid",
        model: "test-model",
        checkedAt: "2026-01-01T00:00:00.000Z",
        error: ""
      },
      dependencies: {
        storage: {
          required: true,
          healthy: true,
          checkedAt: "2026-01-01T00:00:00.000Z",
          detail: "ok"
        }
      },
      requests: {
        inFlight: 3,
        total: 30,
        errors: 1,
        rateLimited: 2,
        avgLatencyMs: 180
      }
    })
  });

  const response = await app.inject({ method: "GET", url: "/api/v1/status" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().runtime.requests, {
    inFlight: 3,
    rateLimited: 2,
    avgLatencyMs: 180
  });
  assert.deepEqual(response.json().runtime.dependencies, {
    storage: {
      required: true,
      healthy: true
    }
  });

  await app.close();
});

test("/metrics exposes prometheus formatted runtime and ops metrics", async () => {
  const app = Fastify();
  registerRuntimeAuth(app, {
    authMode: "jwt",
    authPublicPathPrefixes: ["/metrics", "/api/v1/ops/metrics/prometheus"],
    authTokens: {},
    jwtSecret: "12345678901234567890123456789012"
  });
  await registerSystemRoutes(app, {
    serviceName: "buildwise-test",
    version: "0.0.0",
    isReady: () => true,
    getOpsMetrics: () => ({
      generatedAt: "2026-01-01T00:00:00.000Z",
      latestAuditAt: "2026-01-01T00:00:00.000Z",
      metrics: [
        { name: "deployment_success_rate", value: 98, unit: "%" },
        { name: "iteration_p0_findings_total", value: 0, unit: "count" }
      ]
    }),
    getRuntime: () => ({
      startedAt: "2026-01-01T00:00:00.000Z",
      uptimeSec: 12,
      shuttingDown: false,
      llmRequired: false,
      dependencyRequired: true,
      llm: {
        configured: true,
        reachable: true,
        baseUrl: "https://example.invalid",
        model: "test-model",
        checkedAt: "2026-01-01T00:00:00.000Z",
        error: ""
      },
      dependencies: {
        storage: {
          required: true,
          healthy: true,
          checkedAt: "2026-01-01T00:00:00.000Z",
          detail: "ok"
        }
      },
      requests: {
        inFlight: 3,
        total: 30,
        errors: 1,
        rateLimited: 2,
        avgLatencyMs: 180
      }
    })
  });

  const response = await app.inject({ method: "GET", url: "/metrics" });
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /text\/plain/);
  assert.match(response.body, /buildwise_up 1/);
  assert.match(response.body, /buildwise_runtime_ready 1/);
  assert.match(response.body, /buildwise_deployment_success_rate 98/);

  const versionedResponse = await app.inject({ method: "GET", url: "/api/v1/ops/metrics/prometheus" });
  assert.equal(versionedResponse.statusCode, 200);
  assert.match(versionedResponse.body, /buildwise_iteration_p0_findings_total 0/);

  await app.close();
});

test("currentUserId falls back to x-user-id header when authSub is absent", () => {
  const userId = currentUserId({
    authSub: "",
    headers: { "x-user-id": "contract-owner" }
  });
  assert.equal(userId, "contract-owner");
});

test("currentTenantId reads x-tenant-id header when present", () => {
  const tenantId = currentTenantId({
    authTenantId: "",
    headers: { "x-tenant-id": "tenant-a" }
  });
  assert.equal(tenantId, "tenant-a");
});
