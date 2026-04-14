import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerWorkspaceRoutes } = await import("../dist/interfaces/http/routes/workspaceRoutes.js");
const { registerRepositoryTraceRoutes } = await import("../dist/interfaces/http/routes/repositoryTraceRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");

async function createApp() {
  const repo = createInMemoryWorkspaceRepo();
  const workspaceService = new WorkspaceService(repo, null, null);
  const app = Fastify();
  registerRuntimeAuth(app, { authMode: "off", authPublicPathPrefixes: [], authTokens: {} });
  await app.register(async (v1) => {
    await registerWorkspaceRoutes(v1, workspaceService);
    await registerRepositoryTraceRoutes(v1, workspaceService);
  }, { prefix: "/api/v1" });
  return { app, repo };
}

function headers(userId = "u1", role = "owner") {
  return { "content-type": "application/json", "x-user-id": userId, "x-role": role };
}

test("workspace iteration routes integration", async () => {
  const { app } = await createApp();

  // ──────────────────────────────────────────────
  // Setup: create project
  // ──────────────────────────────────────────────
  const createProjectRes = await app.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: headers(),
    payload: { name: "Test", description: "Test project" }
  });
  assert.equal(createProjectRes.statusCode, 200, "create project should return 200");
  const project = createProjectRes.json();
  assert.ok(project.id, "project should have an id");

  // ──────────────────────────────────────────────
  // 1. Iterations CRUD
  // ──────────────────────────────────────────────

  // 1a. POST create iteration — 200
  const createIterRes = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/iterations`,
    headers: headers(),
    payload: { name: "v0.1.0", description: "first iteration" }
  });
  assert.equal(createIterRes.statusCode, 200, "create iteration should return 200");
  const iteration = createIterRes.json();
  assert.ok(iteration.id, "iteration should have an id");
  assert.equal(iteration.projectId, project.id, "iteration should belong to the project");

  // 1b. GET list iterations — 200, returns array
  const listIterRes = await app.inject({
    method: "GET",
    url: `/api/v1/projects/${project.id}/iterations`,
    headers: headers()
  });
  assert.equal(listIterRes.statusCode, 200, "list iterations should return 200");
  const iterations = listIterRes.json();
  assert.ok(Array.isArray(iterations), "list iterations should return an array");
  assert.equal(iterations.length, 1, "should have exactly one iteration");
  assert.equal(iterations[0].id, iteration.id, "listed iteration id should match");

  // 1c. POST create iteration with empty body — 400 (name is required)
  const createIterBadRes = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/iterations`,
    headers: headers(),
    payload: {}
  });
  assert.equal(createIterBadRes.statusCode, 400, "create iteration without name should return 400");

  // 1d. Create a second iteration for variety
  const createIter2Res = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${project.id}/iterations`,
    headers: headers(),
    payload: { name: "v0.2.0", description: "second iteration" }
  });
  assert.equal(createIter2Res.statusCode, 200, "create second iteration should return 200");
  const listAfterRes = await app.inject({
    method: "GET",
    url: `/api/v1/projects/${project.id}/iterations`,
    headers: headers()
  });
  assert.equal(listAfterRes.json().length, 2, "should now have two iterations");

  // ──────────────────────────────────────────────
  // 2. Messages
  // ──────────────────────────────────────────────

  // 2a. GET messages — 200, returns array (initially empty)
  const listMsgRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/messages`,
    headers: headers()
  });
  assert.equal(listMsgRes.statusCode, 200, "list messages should return 200");
  assert.ok(Array.isArray(listMsgRes.json()), "messages should be an array");

  // 2b. POST message — 200
  const postMsgRes = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/messages`,
    headers: headers(),
    payload: { content: "hello" }
  });
  assert.equal(postMsgRes.statusCode, 200, "post message should return 200");
  const msg = postMsgRes.json();
  assert.equal(msg.content, "hello", "message content should match");

  // 2c. GET messages again — should now have one message
  const listMsgAfterRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/messages`,
    headers: headers()
  });
  assert.equal(listMsgAfterRes.json().length, 1, "should have one message after posting");

  // 2d. POST message with empty content — 400
  const postMsgBadRes = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/messages`,
    headers: headers(),
    payload: { content: "" }
  });
  assert.equal(postMsgBadRes.statusCode, 400, "post message with empty content should return 400");

  // ──────────────────────────────────────────────
  // 3. State Machine
  // ──────────────────────────────────────────────

  // 3a. GET state machine — 200
  const stateMachineRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/state-machine`,
    headers: headers()
  });
  assert.equal(stateMachineRes.statusCode, 200, "get state machine should return 200");

  // 3b. POST state transition — toStatus: "review", reason: "ready for review"
  const transitionRes = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/state/transition`,
    headers: headers(),
    payload: { toStatus: "review", reason: "ready for review" }
  });
  // transition may succeed (200) or fail with 400/409 if "review" is not a valid status;
  // we assert it does not return 500 (server error) — route is reachable and schema-valid
  assert.ok(
    [200, 400, 409].includes(transitionRes.statusCode),
    `state transition should return 200, 400, or 409, got ${transitionRes.statusCode}`
  );

  // ──────────────────────────────────────────────
  // 4. Change Control
  // ──────────────────────────────────────────────

  // 4a. GET change control — 200
  const ccRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/change-control`,
    headers: headers()
  });
  assert.equal(ccRes.statusCode, 200, "get change control should return 200");

  // 4b. POST change control confirm — 200 or 409 (quality gate)
  const ccConfirmRes = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/change-control/confirm`,
    headers: headers(),
    payload: { accurate: true }
  });
  assert.ok(
    [200, 409].includes(ccConfirmRes.statusCode),
    `change control confirm should return 200 or 409, got ${ccConfirmRes.statusCode}`
  );

  // ──────────────────────────────────────────────
  // 5. Artifact Workflow (change-control/artifacts)
  // ──────────────────────────────────────────────

  const artifactWorkflowRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/change-control/artifacts`,
    headers: headers()
  });
  assert.equal(artifactWorkflowRes.statusCode, 200, "get artifact workflow should return 200");

  // ──────────────────────────────────────────────
  // 6. Analysis (upload/analysis via POST /analysis)
  // ──────────────────────────────────────────────

  // 6a. POST analysis with empty body — 400 (fileName is required)
  const analysisBadRes = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/analysis`,
    headers: headers(),
    payload: {}
  });
  assert.equal(analysisBadRes.statusCode, 400, "analysis with empty body should return 400");

  // ──────────────────────────────────────────────
  // 7. Assessment
  // ──────────────────────────────────────────────

  const assessmentRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/assessment`,
    headers: headers()
  });
  assert.equal(assessmentRes.statusCode, 200, "get assessment should return 200");

  // ──────────────────────────────────────────────
  // 8. Release Review
  // ──────────────────────────────────────────────

  const releaseReviewRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/release-review`,
    headers: headers()
  });
  assert.equal(releaseReviewRes.statusCode, 200, "get release review should return 200");

  // ──────────────────────────────────────────────
  // 9. Code Link
  // ──────────────────────────────────────────────

  // 9a. POST code link — 200
  const codeLinkPostRes = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/code-link`,
    headers: headers(),
    payload: { branch: "main" }
  });
  assert.equal(codeLinkPostRes.statusCode, 200, "post code link should return 200");
  const codeLink = codeLinkPostRes.json();
  assert.equal(codeLink.branch, "main", "code link branch should match");

  // 9b. GET code link — 200
  const codeLinkGetRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/code-link`,
    headers: headers()
  });
  assert.equal(codeLinkGetRes.statusCode, 200, "get code link should return 200");
  assert.equal(codeLinkGetRes.json().branch, "main", "returned code link branch should match");

  // ──────────────────────────────────────────────
  // 10. Context
  // ──────────────────────────────────────────────

  const contextRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/context`,
    headers: headers()
  });
  assert.equal(contextRes.statusCode, 200, "get iteration context should return 200");

  // ──────────────────────────────────────────────
  // 11. Nonexistent iteration returns 404/400
  // ──────────────────────────────────────────────

  const ghostId = 99999;
  const ghostMsgRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${ghostId}/messages`,
    headers: headers()
  });
  assert.ok(
    [403, 404].includes(ghostMsgRes.statusCode),
    `messages for nonexistent iteration should return 403 or 404, got ${ghostMsgRes.statusCode}`
  );

  const ghostCcRes = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${ghostId}/change-control`,
    headers: headers()
  });
  assert.ok(
    [403, 404].includes(ghostCcRes.statusCode),
    `change control for nonexistent iteration should return 403 or 404, got ${ghostCcRes.statusCode}`
  );

  await app.close();
});
