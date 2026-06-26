import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo, buildMinimalPolicyRecord } from "./helpers/mock-factories.mjs";

const { FullCycleService } = await import(
  "../dist/application/workspace/quality/fullCycleService.js"
);
const { createFullCycleJob, scanInterruptedFullCyclesOp } = await import(
  "../dist/application/workspace/quality/fullCycleJobOps.js"
);
const { runIterationFullCycleOp } = await import("../dist/application/workspace/quality/fullCycleOps.js");

function makeStubDelegates() {
  return {
    analyzeAttachment: async () => null,
    confirmIterationAnalysis: () => ({ ok: true }),
    rewriteCodeInBoundary: async () => null,
    generateIterationTestArtifacts: async () => null,
    getIterationReleaseReview: () => null,
    generateIterationDeliveryPackage: async () => null,
    publishIterationToRemote: async () => ({ ok: true }),
  };
}

function setup({ withStore = true } = {}) {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "t", description: "d", tenantId: "t1", ownerUserId: "u1" });
  const iteration = repo.createIteration(project.id, { name: "iter", description: "d" });
  const store = { jobs: new Map() };
  const service = new FullCycleService(repo, makeStubDelegates(), null, withStore ? store : null);
  return { repo, project, iteration, store, service };
}

async function waitForJobSettled(service, jobId, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = service.getFullCycleJob(jobId);
    if (job && job.status !== "running") return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  return service.getFullCycleJob(jobId);
}

// ─── fire-and-forget ───

test("startFullCycleJob 立即返回 jobId，句柄初始 running", () => {
  const { service, iteration } = setup();
  const result = service.startFullCycleJob(iteration.id, { runAnalysis: false });
  assert.ok("jobId" in result, "应返回 jobId 而非 error");
  assert.ok(result.jobId.startsWith("fc-"));
  assert.equal(service.getFullCycleJob(result.jobId).status, "running");
});

test("startFullCycleJob 后台跑完后句柄变 completed 且带最终响应", async () => {
  const { service, iteration } = setup();
  const { jobId } = service.startFullCycleJob(iteration.id, { runAnalysis: false });
  const final = await waitForJobSettled(service, jobId);
  assert.ok(final, "job 不应消失");
  assert.equal(final.status, "completed");
  assert.ok(final.finalResponse, "应有最终响应（即便管道 blocked 也返回 response）");
});

test("startFullCycleJob 未注入 jobStore 时返回 error（调用方回退）", () => {
  const { service, iteration } = setup({ withStore: false });
  const result = service.startFullCycleJob(iteration.id, { runAnalysis: false });
  assert.ok("error" in result, "无 store 应返回 error");
});

// ─── 并发锁 ───

test("startFullCycleJob 同 iteration 已有 running job 时复用其 jobId（并发锁，不新建）", () => {
  const { service, store, iteration } = setup();
  createFullCycleJob(store, { jobId: "existing-fc", iterationId: iteration.id, now: "t1" });
  const result = service.startFullCycleJob(iteration.id, { runAnalysis: false });
  assert.equal(result.jobId, "existing-fc", "应复用已有 running job 的 jobId");
  assert.equal(store.jobs.size, 1, "不应新建 job");
});

// ─── buildFullCycleJobStatus ───

test("buildFullCycleJobStatus 句柄在内存时镜像句柄状态 + 附带当前 checkpoint", () => {
  const { service, store, iteration } = setup();
  createFullCycleJob(store, { jobId: "fc-1", iterationId: iteration.id, now: "t1" });
  const status = service.buildFullCycleJobStatus("fc-1", iteration.id);
  assert.equal(status.status, "running");
  assert.equal(status.jobId, "fc-1");
  assert.equal(status.checkpoint, null, "iteration 无 checkpoint 时为 null");
});

test("buildFullCycleJobStatus 内存无句柄但 checkpoint 可续跑时返回 interrupted", () => {
  const { repo, service, iteration } = setup();
  const checkpoint = {
    startedAt: "t1", lastUpdatedAt: "t2", steps: {}, currentStep: "frontend-rewrite",
    resumable: true, completedAt: "",
  };
  // 模拟进程重启：内存 store 空，但 iteration 落盘了 resumable checkpoint
  repo.updateIteration({ ...repo.findIteration(iteration.id), changeControl: { fullCycleCheckpoint: checkpoint } });
  const status = service.buildFullCycleJobStatus("fc-old", iteration.id);
  assert.equal(status.status, "interrupted");
  assert.equal(status.checkpoint, checkpoint, "应回退返回 checkpoint 快照");
});

test("buildFullCycleJobStatus 内存无句柄且无 checkpoint 时返回 null（路由 404）", () => {
  const { service, iteration } = setup();
  assert.equal(service.buildFullCycleJobStatus("nonexistent", iteration.id), null);
});

// ─── 重启恢复：扫描中断 fullCycle ───

test("scanInterruptedFullCyclesOp 识别 resumable 未完成的 checkpoint，跳过已完成和不可续的", () => {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "t", description: "d", tenantId: "t1", ownerUserId: "u1" });
  const iter1 = repo.createIteration(project.id, { name: "i1", description: "d" });
  const iter2 = repo.createIteration(project.id, { name: "i2", description: "d" });
  const iter3 = repo.createIteration(project.id, { name: "i3", description: "d" });

  // iter1: resumable 且未完成（2/3 步完成）→ 应被扫描到
  repo.updateIteration({ ...repo.findIteration(iter1.id), changeControl: { fullCycleCheckpoint: {
    startedAt: "t1", lastUpdatedAt: "t2",
    steps: { "analysis": { status: "completed" }, "confirmation": { status: "completed" }, "ux-guidance": { status: "pending" } },
    currentStep: "ux-guidance", resumable: true, completedAt: ""
  } } });
  // iter2: 已完成（completedAt 非空）→ 跳过
  repo.updateIteration({ ...repo.findIteration(iter2.id), changeControl: { fullCycleCheckpoint: {
    startedAt: "t1", lastUpdatedAt: "t2", steps: {}, currentStep: null, resumable: true, completedAt: "t3"
  } } });
  // iter3: 不可续 → 跳过
  repo.updateIteration({ ...repo.findIteration(iter3.id), changeControl: { fullCycleCheckpoint: {
    startedAt: "t1", lastUpdatedAt: "t2", steps: {}, currentStep: null, resumable: false, completedAt: ""
  } } });

  const summaries = scanInterruptedFullCyclesOp(repo);
  assert.equal(summaries.length, 1, "只有 iter1 是中断未完成");
  assert.equal(summaries[0].iterationId, iter1.id);
  assert.equal(summaries[0].completedStepCount, 2);
  assert.equal(summaries[0].totalStepCount, 3);
  assert.equal(summaries[0].currentStep, "ux-guidance");
});

test("restoreInterruptedFullCycles 对中断的全流程任务写审计日志，不修改 checkpoint", () => {
  const { repo, service, iteration } = setup();
  const checkpoint = {
    startedAt: "t1", lastUpdatedAt: "t2",
    steps: { "analysis": { status: "completed" }, "confirmation": { status: "pending" } },
    currentStep: "confirmation", resumable: true, completedAt: ""
  };
  repo.updateIteration({ ...repo.findIteration(iteration.id), changeControl: { fullCycleCheckpoint: checkpoint } });

  service.restoreInterruptedFullCycles();

  const logs = repo.listAuditLogs();
  const entry = logs.find((l) => l.action === "fullcycle.restart_recovery");
  assert.ok(entry, "应写重启恢复审计日志");
  assert.ok(entry.detail.includes("1/2"), "审计日志应含已完成步数");
  assert.ok(entry.detail.includes("confirmation"), "审计日志应含当前停留步骤");
  assert.ok(entry.detail.includes("续跑"), "审计日志应提示可手动续跑");
  // 不自动续跑、不修改 checkpoint
  const after = repo.findIteration(iteration.id).changeControl.fullCycleCheckpoint;
  assert.equal(after.resumable, true, "checkpoint 不被修改");
  assert.equal(after.completedAt, "", "不自动标记完成");
});

test("restoreInterruptedFullCycles 无中断任务时不写恢复日志", () => {
  const { repo, service } = setup();
  service.restoreInterruptedFullCycles();
  assert.ok(!repo.listAuditLogs().some((l) => l.action === "fullcycle.restart_recovery"));
});

// ─── 取消（cancel）能力 ───

function wireFullCycleParams(repo, iterationId, input, extra = {}) {
  return {
    repo, agentRunner: null, iterationId, input,
    analyzeAttachment: async () => null,
    confirmIterationAnalysis: () => ({ ok: true }),
    rewriteCodeInBoundary: async () => null,
    generateIterationTestArtifacts: async () => null,
    getIterationReleaseReview: () => null,
    generateIterationDeliveryPackage: async () => null,
    publishIterationToRemote: async () => ({ ok: true }),
    ...extra,
  };
}

test("runIterationFullCycleOp 在 shouldCancel=true 时于步骤边界停止并标记可续跑", async () => {
  const { repo, iteration } = setup();
  const params = wireFullCycleParams(repo, iteration.id, { runAnalysis: false, autoConfirmAnalysis: false }, { shouldCancel: () => true });
  const response = await runIterationFullCycleOp(params);
  assert.ok(response, "取消也应返回响应");
  const cp = repo.findIteration(iteration.id).changeControl.fullCycleCheckpoint;
  assert.equal(cp.resumable, true, "取消后应可续跑");
  assert.equal(cp.completedAt, "", "不应标记完成");
  assert.ok(
    repo.listAuditLogs().some((l) => l.action === "fullcycle.cancelled"),
    "应写取消审计日志"
  );
});

test("cancelFullCycleJob 对 running job 请求取消并返回 ok", () => {
  const { service, store, iteration } = setup();
  createFullCycleJob(store, { jobId: "fc-x", iterationId: iteration.id, now: "t1" });
  const result = service.cancelFullCycleJob("fc-x");
  assert.equal(result.ok, true);
  assert.equal(store.jobs.get("fc-x").cancelRequested, true);
});

test("cancelFullCycleJob 对已终态 job 返回 ok=false", async () => {
  const { service, iteration } = setup();
  const { jobId } = service.startFullCycleJob(iteration.id, { runAnalysis: false });
  const final = await waitForJobSettled(service, jobId);
  assert.notEqual(final.status, "running");
  const result = service.cancelFullCycleJob(jobId);
  assert.equal(result.ok, false);
});

test("startFullCycleJob 后 cancelFullCycleJob 使后台任务停止并标记 cancelled", async () => {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "t", description: "d", tenantId: "t1", ownerUserId: "u1" });
  const iteration = repo.createIteration(project.id, { name: "iter", description: "d" });
  const store = { jobs: new Map() };
  // 慢 confirmation 确保 cancel 在执行中生效：confirmation 50ms 期间主线程设标志，
  // 下一步边界 shouldCancel 读到 true → 取消。
  const delegates = {
    analyzeAttachment: async () => null,
    confirmIterationAnalysis: () => new Promise((res) => setTimeout(() => res({ ok: true }), 50)),
    rewriteCodeInBoundary: async () => null,
    generateIterationTestArtifacts: async () => null,
    getIterationReleaseReview: () => null,
    generateIterationDeliveryPackage: async () => null,
    publishIterationToRemote: async () => ({ ok: true }),
  };
  const service = new FullCycleService(repo, delegates, null, store);
  const { jobId } = service.startFullCycleJob(iteration.id, { runAnalysis: false });
  service.cancelFullCycleJob(jobId);
  const final = await waitForJobSettled(service, jobId, 3000);
  assert.equal(final.status, "cancelled");
  const cp = repo.findIteration(iteration.id).changeControl?.fullCycleCheckpoint;
  assert.equal(cp.resumable, true, "取消后 checkpoint 应可续跑");
});

// ─── policyGate 门禁接入 fullCycle（T5：①②阻断 ③记审计不阻断）───

test("fullCycle 遇 stale 制品门禁 → 该步 blocked + 审计 + checkpoint 可续跑", async () => {
  const { repo, service, iteration } = setup();
  const iter = repo.findIteration(iteration.id);
  iter.changeControl = {
    lastAnalysisAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    confirmedBy: "user",
    artifactWorkflow: { activeStage: "release", items: [{ id: "release-review", stage: "release", status: "ready", stale: true, outputVersion: 1, lastConfirmedAt: "", lastConfirmedBy: "" }] }
  };
  repo.updateIteration(iter);
  const { jobId } = service.startFullCycleJob(iteration.id, { runAnalysis: false, autoConfirmAnalysis: true });
  const final = await waitForJobSettled(service, jobId);
  assert.ok(final.finalResponse, "应有最终响应");
  assert.equal(final.finalResponse.status, "blocked", "门禁阻断应使整体状态 blocked");
  assert.equal(final.finalResponse.steps.confirmation.status, "blocked", "confirmation 步应被 stale 门禁阻断");
  assert.equal(final.finalResponse.checkpoint.resumable, true, "阻断后 checkpoint 可续跑");
  const logs = repo.listPolicyExecutionLogs(iteration.id);
  assert.ok(logs.some((l) => l.action === "fullcycle_gate_check" && l.result === "blocked"), "应有门禁阻断审计");
});

test("fullCycle 遇 缺人工确认门禁 → 记 advisory 审计, 不阻断该步继续推进", async () => {
  const { repo, project, service, iteration } = setup();
  repo._store.projectPolicies.push(buildMinimalPolicyRecord(project.id, {
    strategy: { stages: ["scope"], gates: [{ stage: "scope", requiredArtifacts: [], requireHumanConfirmation: true }], requiredConfirmations: { firstIterationGitReport: false }, exceptions: [], skillsPlan: [] }
  }));
  const iter = repo.findIteration(iteration.id);
  iter.changeControl = {
    lastAnalysisAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    confirmedBy: "user",
    artifactWorkflow: { activeStage: "scope", items: [] }
  };
  repo.updateIteration(iter);
  const { jobId } = service.startFullCycleJob(iteration.id, { runAnalysis: false, autoConfirmAnalysis: true });
  const final = await waitForJobSettled(service, jobId);
  const logs = repo.listPolicyExecutionLogs(iteration.id);
  assert.ok(logs.some((l) => l.action === "fullcycle_gate_check" && l.result === "advisory_skipped"), "应有门禁建议审计(不阻断)");
  assert.notEqual(final.finalResponse.steps.confirmation.status, "blocked", "advisory 不应阻断 confirmation 步");
});
