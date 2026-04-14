import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerPlatformRoutes } = await import("../dist/interfaces/http/routes/platformRoutes.js");
const { registerWorkspaceRoutes } = await import("../dist/interfaces/http/routes/workspaceRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");
const { PlatformService } = await import("../dist/application/platform/platformService.js");

async function createApp() {
  const repo = createInMemoryWorkspaceRepo();
  const workspaceService = new WorkspaceService(repo, null, null);
  const platformService = new PlatformService(repo);
  const app = Fastify();
  registerRuntimeAuth(app, { authMode: "off", authPublicPathPrefixes: [], authTokens: {} });
  await app.register(async (v1) => {
    await registerWorkspaceRoutes(v1, workspaceService);
    await registerPlatformRoutes(v1, platformService, workspaceService);
  }, { prefix: "/api/v1" });
  return { app, repo };
}

function headers(userId = "u1", role = "owner") {
  return { "content-type": "application/json", "x-user-id": userId, "x-role": role };
}

/**
 * Helper: create a project + iteration so platform routes have valid IDs to work with.
 */
async function seedProjectAndIteration(app) {
  const createRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({ name: "Test", description: "Test project" })
  });
  assert.equal(createRes.statusCode, 200);
  const project = createRes.json();

  const iterRes = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/iterations`,
    headers: headers(),
    payload: JSON.stringify({
      name: "Iter 1",
      description: "first iteration",
      goals: ["goal"],
      scope: { inScope: ["a"], outOfScope: ["b"], acceptanceCriteria: ["c"] },
      aiSummary: "summary"
    })
  });
  assert.equal(iterRes.statusCode, 200);
  const iteration = iterRes.json();

  return { projectId: project.id, iterationId: iteration.id };
}

// ────────────────────────────────────────
// 1. Version Snapshots
// ────────────────────────────────────────

test("GET /collab/snapshots — returns 200 with array", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/collab/snapshots?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body), "response should be an array");
  assert.equal(body.length, 0, "initially empty");
  await app.close();
});

test("POST /collab/snapshots — creates snapshot, returns 200", async () => {
  const { app } = await createApp();
  const { projectId, iterationId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/collab/snapshots",
    headers: headers(),
    payload: JSON.stringify({ projectId, iterationId, name: "v1.0", note: "baseline" })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.projectId, projectId);
  assert.equal(body.iterationId, iterationId);
  assert.equal(body.name, "v1.0");
  assert.ok(body.id, "snapshot should have an id");

  // verify it shows up in list
  const listRes = await app.inject({
    method: "GET",
    url: `/api/v1/collab/snapshots?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(listRes.json().length, 1);
  await app.close();
});

test("POST /collab/snapshots — 400 when required fields missing", async () => {
  const { app } = await createApp();
  await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/collab/snapshots",
    headers: headers(),
    payload: JSON.stringify({ projectId: 1 })
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

// ────────────────────────────────────────
// 2. Project Shares
// ────────────────────────────────────────

test("GET /collab/shares — returns 200 with array", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/collab/shares?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
  await app.close();
});

test("POST /collab/shares — creates share, returns 200 with token", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/collab/shares",
    headers: headers(),
    payload: JSON.stringify({ projectId, permission: "read", ttlHours: 48 })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.token, "share should contain a token");
  assert.equal(body.projectId, projectId);
  assert.equal(body.permission, "read");
  assert.ok(body.expiresAt, "share should have expiresAt");
  await app.close();
});

test("POST /collab/shares — 400 when body is empty", async () => {
  const { app } = await createApp();
  await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/collab/shares",
    headers: headers(),
    payload: JSON.stringify({})
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.ok(body.message, "should return an error message");
  await app.close();
});

// ────────────────────────────────────────
// 3. Deployments
// ────────────────────────────────────────

test("GET /ops/deployments — returns 200 with array", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/ops/deployments?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
  await app.close();
});

test("POST /ops/deployments — creates deployment or blocked by release gate", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ops/deployments",
    headers: headers(),
    payload: JSON.stringify({ projectId, environment: "staging", version: "1.0.0" })
  });
  // Deploy may succeed (200) or be blocked by release gate (409)
  assert.ok([200, 409].includes(res.statusCode), `expected 200 or 409, got ${res.statusCode}`);
  const body = res.json();
  if (res.statusCode === 200) {
    assert.equal(body.projectId, projectId);
    assert.equal(body.environment, "staging");
    assert.equal(body.status, "queued");
  } else {
    assert.ok(body.message, "409 should include a message");
  }
  await app.close();
});

test("POST /ops/deployments — 400 when required fields missing", async () => {
  const { app } = await createApp();
  await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ops/deployments",
    headers: headers(),
    payload: JSON.stringify({ projectId: 1 })
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.ok(body.message);
  await app.close();
});

// ────────────────────────────────────────
// 4. Template Runs
// ────────────────────────────────────────

test("GET /templates/runs — returns 200 with array", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/templates/runs?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 0);
  await app.close();
});

test("POST /templates/:id/run — starts template run, returns 200", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/templates/tpl-req-review/run",
    headers: headers(),
    payload: JSON.stringify({ projectId, parameters: { focus: "API安全" } })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.templateId, "tpl-req-review");
  assert.equal(body.projectId, projectId);
  assert.equal(body.status, "completed");
  assert.ok(body.runId, "template run should have a runId");

  // verify it shows in the runs list
  const listRes = await app.inject({
    method: "GET",
    url: `/api/v1/templates/runs?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(listRes.json().length, 1);
  await app.close();
});

test("POST /templates/:id/run — 404 for non-existent template", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/templates/non-existent/run",
    headers: headers(),
    payload: JSON.stringify({ projectId })
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});

// ────────────────────────────────────────
// 5. Ops Triage Templates
// ────────────────────────────────────────

test("GET /ops/triage-templates — returns 200 with templates object", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/ops/triage-templates?projectId=${projectId}`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.templates, "response should have a templates property");
  assert.ok(Array.isArray(body.templates), "templates should be an array");
  assert.ok(body.generatedAt, "response should have generatedAt");
  // system templates are always present
  assert.ok(body.templates.length > 0, "should include system triage templates");
  await app.close();
});

test("POST /ops/triage-templates — creates custom triage template", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ops/triage-templates",
    headers: headers(),
    payload: JSON.stringify({
      projectId,
      category: "database",
      keywords: ["slow-query", "deadlock"],
      commands: ["SHOW PROCESSLIST", "SHOW ENGINE INNODB STATUS"]
    })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.category, "database");
  assert.ok(body.id, "triage template should have an id");

  // verify it appears in list
  const listRes = await app.inject({
    method: "GET",
    url: `/api/v1/ops/triage-templates?projectId=${projectId}`,
    headers: headers()
  });
  const templates = listRes.json().templates;
  const custom = templates.filter((t) => t.source === "custom");
  assert.ok(custom.length >= 1, "custom template should appear in list");
  await app.close();
});

// ────────────────────────────────────────
// 6. Schema Validation
// ────────────────────────────────────────

test("POST /collab/shares — 400 when projectId and permission both missing", async () => {
  const { app } = await createApp();
  await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/collab/shares",
    headers: headers(),
    payload: JSON.stringify({ ttlHours: 24 })
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("POST /ops/deployments — 400 when environment and version missing", async () => {
  const { app } = await createApp();
  const { projectId } = await seedProjectAndIteration(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/ops/deployments",
    headers: headers(),
    payload: JSON.stringify({ projectId })
  });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.match(body.message, /environment|version|required/i);
  await app.close();
});

test("GET /collab/snapshots — 400 when projectId query param missing", async () => {
  const { app } = await createApp();

  const res = await app.inject({
    method: "GET",
    url: "/api/v1/collab/snapshots",
    headers: headers()
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});
