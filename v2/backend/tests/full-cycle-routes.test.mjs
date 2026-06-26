import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { registerRuntimeAuth } = await import("../dist/infrastructure/runtime/runtimeAuth.js");
const { registerWorkspaceRoutes } = await import("../dist/interfaces/http/routes/workspaceRoutes.js");
const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");

async function createApp() {
  const repo = createInMemoryWorkspaceRepo();
  const fullCycleJobStore = { jobs: new Map() };
  const workspaceService = new WorkspaceService(repo, null, null, null, null, fullCycleJobStore);
  const app = Fastify();
  registerRuntimeAuth(app, { authMode: "off", authPublicPathPrefixes: [], authTokens: {} });
  await app.register(async (v1) => {
    await registerWorkspaceRoutes(v1, workspaceService);
  }, { prefix: "/api/v1" });
  return { app, repo, fullCycleJobStore };
}

function headers(userId = "u1", role = "owner") {
  return { "content-type": "application/json", "x-user-id": userId, "x-role": role };
}

async function setupIteration(app) {
  const projectRes = await app.inject({
    method: "POST", url: "/api/v1/projects", headers: headers(),
    payload: { name: "t", description: "d" }
  });
  const project = projectRes.json();
  const iterRes = await app.inject({
    method: "POST", url: `/api/v1/projects/${project.id}/iterations`, headers: headers(),
    payload: { name: "iter", description: "d" }
  });
  return { project, iteration: iterRes.json() };
}

async function pollJobStatus(app, iterationId, jobId, timeoutMs = 2000) {
  const url = `/api/v1/iterations/${iterationId}/full-cycle/jobs/${jobId}`;
  const deadline = Date.now() + timeoutMs;
  let res = await app.inject({ method: "GET", url, headers: headers() });
  while (Date.now() < deadline && res.statusCode === 200 && res.json().status === "running") {
    await new Promise((r) => setTimeout(r, 10));
    res = await app.inject({ method: "GET", url, headers: headers() });
  }
  return res;
}

// ─── POST 异步触发 ───

test("POST /full-cycle 立即返回 202 + jobId（不阻塞管道）", async () => {
  const { app } = await createApp();
  const { iteration } = await setupIteration(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/full-cycle`,
    headers: headers(),
    payload: { runAnalysis: false }
  });
  assert.equal(res.statusCode, 202);
  const body = res.json();
  assert.equal(body.status, "running");
  assert.ok(body.jobId.startsWith("fc-"));
  await app.close();
});

test("POST /full-cycle viewer 角色被拒（403）", async () => {
  const { app } = await createApp();
  const { iteration } = await setupIteration(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/v1/iterations/${iteration.id}/full-cycle`,
    headers: headers("u1", "viewer"),
    payload: { runAnalysis: false }
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

// ─── GET 进度查询 ───

test("GET /full-cycle/jobs/:jobId 轮询拿到最终 completed 状态", async () => {
  const { app } = await createApp();
  const { iteration } = await setupIteration(app);
  const started = (await app.inject({
    method: "POST", url: `/api/v1/iterations/${iteration.id}/full-cycle`,
    headers: headers(), payload: { runAnalysis: false }
  })).json();
  const final = await pollJobStatus(app, iteration.id, started.jobId);
  assert.equal(final.statusCode, 200);
  assert.equal(final.json().status, "completed");
  await app.close();
});

test("GET /full-cycle/jobs/:jobId 内存无句柄但 checkpoint 可续跑时返回 interrupted", async () => {
  const { app, repo } = await createApp();
  const { iteration } = await setupIteration(app);
  const checkpoint = {
    resumable: true, startedAt: "t1", lastUpdatedAt: "t2",
    steps: {}, currentStep: "frontend-rewrite", completedAt: ""
  };
  // 模拟进程重启：内存 job 句柄丢失，但 iteration 落盘了 resumable checkpoint
  repo.updateIteration({ ...repo.findIteration(iteration.id), changeControl: { fullCycleCheckpoint: checkpoint } });
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/full-cycle/jobs/fc-old`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "interrupted");
  await app.close();
});

test("GET /full-cycle/jobs/:jobId 无 job 无 checkpoint 时返回 404", async () => {
  const { app } = await createApp();
  const { iteration } = await setupIteration(app);
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/full-cycle/jobs/nonexistent`,
    headers: headers()
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});

// ─── GET 中断查询（刷新后感知）───

test("GET /full-cycle/interrupted 有 resumable checkpoint 时返回 interrupted=true 与步数", async () => {
  const { app, repo } = await createApp();
  const { iteration } = await setupIteration(app);
  repo.updateIteration({ ...repo.findIteration(iteration.id), changeControl: { fullCycleCheckpoint: {
    resumable: true, startedAt: "t1", lastUpdatedAt: "t2",
    steps: { "analysis": { status: "completed" }, "confirmation": { status: "pending" } },
    currentStep: "confirmation", completedAt: ""
  } } });
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/full-cycle/interrupted`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.interrupted, true);
  assert.equal(body.completedStepCount, 1);
  assert.equal(body.totalStepCount, 2);
  assert.equal(body.currentStep, "confirmation");
  await app.close();
});

test("GET /full-cycle/interrupted 无中断 checkpoint 时返回 interrupted=false", async () => {
  const { app } = await createApp();
  const { iteration } = await setupIteration(app);
  const res = await app.inject({
    method: "GET",
    url: `/api/v1/iterations/${iteration.id}/full-cycle/interrupted`,
    headers: headers()
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.interrupted, false);
  assert.equal(body.checkpoint, null);
  await app.close();
});
