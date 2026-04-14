import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerWorkspaceRoutes } = await import("../dist/interfaces/http/routes/workspaceRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");

async function createApp() {
  const repo = createInMemoryWorkspaceRepo();
  const workspaceService = new WorkspaceService(repo, null, null);
  const app = Fastify();
  registerRuntimeAuth(app, { authMode: "off", authPublicPathPrefixes: [], authTokens: {} });
  await app.register(async (v1) => {
    await registerWorkspaceRoutes(v1, workspaceService);
  }, { prefix: "/api/v1" });
  return { app, repo };
}

function headers(userId = "u1", role = "owner") {
  return { "content-type": "application/json", "x-user-id": userId, "x-role": role };
}

// ─── 1. Projects CRUD ───

test("GET /projects returns array (empty initially)", async () => {
  const { app } = await createApp();
  const res = await app.inject({ method: "GET", url: "/api/v1/projects", headers: headers() });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body), "response should be an array");
  await app.close();
});

test("POST /projects creates project and returns it with id", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({ name: "New Project", description: "desc" })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.id, "created project should have an id");
  assert.equal(body.name, "New Project");
  await app.close();
});

test("POST /projects with empty body returns 400 (schema validation)", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({})
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("GET /projects returns created project after POST", async () => {
  const { app } = await createApp();
  await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({ name: "Listed Project", description: "should appear" })
  });
  const res = await app.inject({ method: "GET", url: "/api/v1/projects", headers: headers() });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.length >= 1, "should contain at least one project");
  assert.ok(body.some((p) => p.name === "Listed Project"));
  await app.close();
});

test("GET /projects/:id/iterations on non-existent project returns 404", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/projects/999/iterations",
    headers: headers()
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});

// ─── 2. Project Iterations (create & list) ───

test("POST /projects/:id/iterations creates iteration on existing project", async () => {
  const { app } = await createApp();
  const createRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({ name: "Iter Project", description: "for iterations" })
  });
  const projectId = createRes.json().id;

  const iterRes = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/iterations`,
    headers: headers(),
    payload: JSON.stringify({
      name: "Sprint 1",
      description: "first sprint",
      goals: ["deliver MVP"],
      scope: { inScope: ["auth"], outOfScope: ["billing"], acceptanceCriteria: ["login works"] },
      aiSummary: "MVP sprint"
    })
  });
  assert.equal(iterRes.statusCode, 200);
  const iterBody = iterRes.json();
  assert.ok(iterBody.id, "iteration should have an id");
  assert.equal(iterBody.projectId, projectId);
  await app.close();
});

test("DELETE /projects/:id on non-existent project returns error", async () => {
  const { app } = await createApp();
  const delRes = await app.inject({
    method: "DELETE",
    url: "/api/v1/projects/9999",
    headers: headers()
  });
  assert.ok([400, 404].includes(delRes.statusCode), `expected 400 or 404, got ${delRes.statusCode}`);
  await app.close();
});

// ─── 3. Governance Routes ───

test("GET /governance/roles returns 200 with array", async () => {
  const { app } = await createApp();
  const res = await app.inject({ method: "GET", url: "/api/v1/governance/roles", headers: headers() });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body), "governance roles should be an array");
  await app.close();
});

test("POST /governance/custom-roles creates a custom role (admin only)", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/governance/custom-roles",
    headers: headers("admin1", "admin"),
    payload: JSON.stringify({ name: "Tech Lead", description: "technical lead role", permissions: [] })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.name, "Tech Lead");

  // Verify it appears in the list
  const listRes = await app.inject({
    method: "GET",
    url: "/api/v1/governance/custom-roles",
    headers: headers()
  });
  assert.equal(listRes.statusCode, 200);
  const roles = listRes.json();
  assert.ok(roles.some((r) => r.name === "Tech Lead"));
  await app.close();
});

test("GET /governance/platform-role-bindings returns 200 for admin", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/governance/platform-role-bindings",
    headers: headers("admin1", "admin")
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body), "platform role bindings should be an array");
  await app.close();
});

test("POST /governance/platform-role-bindings creates binding for admin", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/governance/platform-role-bindings",
    headers: headers("admin1", "admin"),
    payload: JSON.stringify({ userId: "13800138000", role: "admin" })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.userId, "13800138000");
  assert.equal(body.role, "admin");
  await app.close();
});

test("GET /governance/platform-role-bindings returns 403 for non-admin", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "GET",
    url: "/api/v1/governance/platform-role-bindings",
    headers: headers("viewer1", "viewer")
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

// ─── 4. Policy Routes ───

test("GET /projects/:id/policies returns 200 with active and items", async () => {
  const { app } = await createApp();
  const createRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({ name: "Policy Project", description: "for policy tests" })
  });
  const projectId = createRes.json().id;

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/projects/${projectId}/policies`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok("active" in body, "response should have active field");
  assert.ok("items" in body, "response should have items field");
  assert.ok(Array.isArray(body.items), "items should be an array");
  await app.close();
});

test("POST /projects/:id/policies creates a policy draft (admin)", async () => {
  const { app } = await createApp();
  const createRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: JSON.stringify({ name: "Policy Draft Project", description: "policy draft test" })
  });
  const projectId = createRes.json().id;

  const res = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/policies`,
    headers: headers("u1", "owner"),
    payload: JSON.stringify({ strategy: { stages: ["clarification", "development"] } })
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.version != null, "policy draft should have a version");
  assert.equal(body.projectId, projectId);
  await app.close();
});
