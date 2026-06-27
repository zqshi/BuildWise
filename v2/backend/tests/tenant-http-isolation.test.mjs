import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerWorkspaceRoutes } = await import("../dist/interfaces/http/routes/workspaceRoutes.js");
const { registerPlatformRoutes } = await import("../dist/interfaces/http/routes/platformRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");
const { PlatformService } = await import("../dist/application/platform/platformService.js");

async function createTenantApp() {
  const repo = createInMemoryWorkspaceRepo();
  const workspaceService = new WorkspaceService(repo, null, null);
  const platformService = new PlatformService(repo);
  const app = Fastify();

  registerRuntimeAuth(app, {
    authMode: "off",
    authPublicPathPrefixes: [],
    authTokens: {}
  });

  await app.register(async (v1) => {
    await registerWorkspaceRoutes(v1, workspaceService);
    await registerPlatformRoutes(v1, platformService, workspaceService);
  }, { prefix: "/api/v1" });

  return { app, repo };
}

async function requestJson(app, options) {
  const response = await app.inject(options);
  const contentType = response.headers["content-type"] || "";
  const payload = contentType.includes("application/json") ? response.json() : response.body;
  return { response, payload };
}

function authHeaders(userId, role = "owner") {
  return {
    "content-type": "application/json",
    "x-user-id": userId,
    "x-role": role
  };
}

test("HTTP routes enforce tenant project visibility and tenant member sharing", async () => {
  const { app } = await createTenantApp();

  const createProject = await requestJson(app, {
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ name: "Tenant A Project", description: "tenant scoped" })
  });
  assert.equal(createProject.response.statusCode, 200);
  const projectId = createProject.payload.id;

  const ownerProjects = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: authHeaders("owner-a")
  });
  assert.deepEqual(ownerProjects.payload.map((item) => item.id), [projectId]);

  const outsiderProjects = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: authHeaders("owner-b")
  });
  assert.deepEqual(outsiderProjects.payload, []);

  const addTenantMember = await requestJson(app, {
    method: "POST",
    url: `/api/v1/projects/${projectId}/roles`,
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ userId: "member-a", role: "member" })
  });
  assert.equal(addTenantMember.response.statusCode, 200);
  assert.equal(addTenantMember.payload.tenantId, "owner-a");

  const tenantMembers = await requestJson(app, {
    method: "GET",
    url: `/api/v1/projects/${projectId}/roles`,
    headers: authHeaders("member-a", "pm")
  });
  assert.equal(tenantMembers.response.statusCode, 200);
  assert.deepEqual(
    tenantMembers.payload.map((item) => ({ userId: item.userId, role: item.role })),
    [{ userId: "member-a", role: "member" }]
  );

  const memberProjects = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: authHeaders("member-a", "pm")
  });
  assert.deepEqual(memberProjects.payload.map((item) => item.id), [projectId]);

  const ownerCreateIteration = await requestJson(app, {
    method: "POST",
    url: `/api/v1/projects/${projectId}/iterations`,
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({
      name: "Iteration 1",
      description: "iteration",
      goals: ["goal"],
      scope: { inScope: ["a"], outOfScope: ["b"], acceptanceCriteria: ["c"] },
      aiSummary: "summary"
    })
  });
  assert.equal(ownerCreateIteration.response.statusCode, 200);
  const iterationId = ownerCreateIteration.payload.id;

  const outsiderIterationRead = await requestJson(app, {
    method: "GET",
    url: `/api/v1/projects/${projectId}/iterations`,
    headers: authHeaders("owner-b")
  });
  assert.equal(outsiderIterationRead.response.statusCode, 403);

  const memberCreateIteration = await requestJson(app, {
    method: "POST",
    url: `/api/v1/projects/${projectId}/iterations`,
    headers: authHeaders("member-a", "pm"),
    payload: JSON.stringify({
      name: "Iteration 2",
      description: "member iteration",
      goals: ["goal"],
      scope: { inScope: ["a"], outOfScope: ["b"], acceptanceCriteria: ["c"] },
      aiSummary: "summary"
    })
  });
  assert.equal(memberCreateIteration.response.statusCode, 200);

  const outsiderMessages = await requestJson(app, {
    method: "GET",
    url: `/api/v1/iterations/${iterationId}/messages`,
    headers: authHeaders("owner-b")
  });
  assert.equal(outsiderMessages.response.statusCode, 403);

  await app.close();
});

test("platform collaboration routes stay tenant scoped", async () => {
  const { app } = await createTenantApp();

  const createProject = await requestJson(app, {
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ name: "Tenant Ops", description: "tenant scoped" })
  });
  const projectId = createProject.payload.id;

  const createIteration = await requestJson(app, {
    method: "POST",
    url: `/api/v1/projects/${projectId}/iterations`,
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({
      name: "Ops Iteration",
      description: "iteration",
      goals: ["goal"],
      scope: { inScope: ["a"], outOfScope: ["b"], acceptanceCriteria: ["c"] },
      aiSummary: "summary"
    })
  });
  const iterationId = createIteration.payload.id;

  const snapshotCreated = await requestJson(app, {
    method: "POST",
    url: "/api/v1/collab/snapshots",
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ projectId, iterationId, name: "v1", note: "baseline" })
  });
  assert.equal(snapshotCreated.response.statusCode, 200);

  const outsiderSnapshots = await requestJson(app, {
    method: "GET",
    url: `/api/v1/collab/snapshots?projectId=${projectId}`,
    headers: authHeaders("owner-b")
  });
  assert.equal(outsiderSnapshots.response.statusCode, 403);

  const outsiderShare = await requestJson(app, {
    method: "POST",
    url: "/api/v1/collab/shares",
    headers: authHeaders("owner-b"),
    payload: JSON.stringify({ projectId, permission: "comment", ttlHours: 24 })
  });
  assert.equal(outsiderShare.response.statusCode, 403);

  const ownerShare = await requestJson(app, {
    method: "POST",
    url: "/api/v1/collab/shares",
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ projectId, permission: "comment", ttlHours: 24 })
  });
  assert.equal(ownerShare.response.statusCode, 200);

  await app.close();
});

test("single account can switch between multiple tenants", async () => {
  const { app } = await createTenantApp();

  const ownerAProject = await requestJson(app, {
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ name: "Tenant A Root", description: "a" })
  });
  const projectAId = ownerAProject.payload.id;

  const ownerBProject = await requestJson(app, {
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders("owner-b"),
    payload: JSON.stringify({ name: "Tenant B Root", description: "b" })
  });
  const projectBId = ownerBProject.payload.id;

  const addToTenantA = await requestJson(app, {
    method: "POST",
    url: `/api/v1/projects/${projectAId}/roles`,
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ userId: "shared-user", role: "member" })
  });
  assert.equal(addToTenantA.response.statusCode, 200);

  const addToTenantB = await requestJson(app, {
    method: "POST",
    url: `/api/v1/projects/${projectBId}/roles`,
    headers: authHeaders("owner-b"),
    payload: JSON.stringify({ userId: "shared-user", role: "member" })
  });
  assert.equal(addToTenantB.response.statusCode, 200);

  const tenantAProjects = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: { ...authHeaders("shared-user", "pm"), "x-tenant-id": "owner-a" }
  });
  assert.deepEqual(tenantAProjects.payload.map((item) => item.id), [projectAId]);

  const tenantBProjects = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: { ...authHeaders("shared-user", "pm"), "x-tenant-id": "owner-b" }
  });
  assert.deepEqual(tenantBProjects.payload.map((item) => item.id), [projectBId]);

  const createdInTenantB = await requestJson(app, {
    method: "POST",
    url: "/api/v1/projects",
    headers: { ...authHeaders("shared-user", "pm"), "x-tenant-id": "owner-b" },
    payload: JSON.stringify({ name: "Shared Member Project", description: "created in selected tenant" })
  });
  assert.equal(createdInTenantB.response.statusCode, 200);
  assert.equal(createdInTenantB.payload.tenantId, "owner-b");

  const invalidTenantSelection = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: { ...authHeaders("shared-user", "pm"), "x-tenant-id": "owner-c" }
  });
  // v0.18.0: 读列表不应被 tenantId 门禁阻断——无权租户返回空列表而非 403
  // (前端 localStorage 残留/失效 tenantId 时降级为空,不报「项目数据加载失败」)
  assert.equal(invalidTenantSelection.response.statusCode, 200);
  assert.deepEqual(invalidTenantSelection.payload, []);

  await app.close();
});

test("assistant routes reject query/body tenantId forgery (auth tenant only)", async () => {
  const { app } = await createTenantApp();

  const chatA = await requestJson(app, {
    method: "POST",
    url: "/api/v1/assistant/chat",
    headers: authHeaders("userA"),
    payload: JSON.stringify({ message: "secret-from-tenant-a" })
  });
  assert.equal(chatA.response.statusCode, 200);

  const chatB = await requestJson(app, {
    method: "POST",
    url: "/api/v1/assistant/chat",
    headers: authHeaders("userB"),
    payload: JSON.stringify({ message: "secret-from-tenant-b" })
  });
  assert.equal(chatB.response.statusCode, 200);

  const msgsForged = await requestJson(app, {
    method: "GET",
    url: "/api/v1/assistant/messages?tenantId=userB",
    headers: authHeaders("userA")
  });
  const forgedContents = msgsForged.payload.map((m) => m.content).join("");
  assert.ok(forgedContents.includes("secret-from-tenant-a"), "应包含租户A自己的消息");
  assert.ok(!forgedContents.includes("secret-from-tenant-b"), "不得返回租户B的消息（query 伪造 tenantId 应被忽略）");

  await requestJson(app, {
    method: "POST",
    url: "/api/v1/assistant/clear",
    headers: authHeaders("userA"),
    payload: JSON.stringify({ tenantId: "userB" })
  });
  const msgsB = await requestJson(app, {
    method: "GET",
    url: "/api/v1/assistant/messages?tenantId=userB",
    headers: authHeaders("userB")
  });
  const contentsB = msgsB.payload.map((m) => m.content).join("");
  assert.ok(contentsB.includes("secret-from-tenant-b"), "userA 伪造 body tenantId 的 clear 不得清掉 userB 的消息");

  await app.close();
});

test("GET /projects tolerates foreign tenant id without 403 (returns empty list)", async () => {
  const { app } = await createTenantApp();

  await requestJson(app, {
    method: "POST",
    url: "/api/v1/projects",
    headers: authHeaders("owner-a"),
    payload: JSON.stringify({ name: "Owner A Project", description: "private" })
  });

  // 普通用户 user-x 带 owner-a 的 tenantId(残留/伪造),对 owner-a 无读权限
  // 读列表应降级为空列表,不报 403 阻断用户(v0.18.0 缺陷 B 止血)
  const res = await requestJson(app, {
    method: "GET",
    url: "/api/v1/projects",
    headers: { ...authHeaders("user-x", "pm"), "x-tenant-id": "owner-a" }
  });
  assert.equal(res.response.statusCode, 200);
  assert.deepEqual(res.payload, []);

  await app.close();
});
