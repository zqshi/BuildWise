import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerWorkspaceRoutes } = await import("../dist/interfaces/http/routes/workspaceRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");

async function createApp() {
  const repo = createInMemoryWorkspaceRepo();
  const workspaceService = new WorkspaceService(repo, null, null, null, null, null);
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

async function setupIteration(app, repo, withKb = true) {
  const projectRes = await app.inject({ method: "POST", url: "/api/v1/projects", headers: headers(), payload: { name: "t", description: "d" } });
  const project = projectRes.json();
  if (withKb) {
    repo.updateProject({ ...project, knowledgeBase: { ontologyTerms: [{ term: "线索状态机", aliases: [], definition: "d", evidence: "e" }], componentInventory: [], stableRules: [], codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: "" } });
  }
  const iterRes = await app.inject({ method: "POST", url: `/api/v1/projects/${project.id}/iterations`, headers: headers(), payload: { name: "iter", description: "d" } });
  return { project, iteration: iterRes.json() };
}

test("POST /detect-change-impact 本体命中 → hasImpact=true 含 affectedTerms", async () => {
  const { app, repo } = await createApp();
  const { iteration } = await setupIteration(app, repo, true);
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/detect-change-impact`,
    headers: headers(),
    payload: { message: "调整线索状态机" }
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.hasImpact, true);
  assert.deepEqual(body.affectedTerms, ["线索状态机"]);
  await app.close();
});

test("POST /detect-change-impact 迭代无本体 → hasImpact=false", async () => {
  const { app, repo } = await createApp();
  const { iteration } = await setupIteration(app, repo, false);
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/detect-change-impact`,
    headers: headers(),
    payload: { message: "任意需求" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().hasImpact, false);
  await app.close();
});

test("POST /detect-change-impact viewer 角色可读（read 权限）", async () => {
  const { app, repo } = await createApp();
  const { iteration } = await setupIteration(app, repo, false);
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/detect-change-impact`,
    headers: headers("u1", "viewer"),
    payload: { message: "任意需求" }
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test("POST /detect-change-impact 迭代不存在 → 404", async () => {
  const { app } = await createApp();
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/999999/detect-change-impact`,
    headers: headers(),
    payload: { message: "任意需求" }
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});
