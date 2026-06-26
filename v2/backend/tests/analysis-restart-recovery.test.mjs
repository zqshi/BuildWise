import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { markAnalysisJobInterruptedOnRestartOp, createQueuedAnalysisJobOp } = await import(
  "../dist/application/workspace/analysis/queueOps.js"
);
const { AnalysisService } = await import(
  "../dist/application/workspace/analysis/analysisService.js"
);

function makeRuntimeJob(overrides = {}) {
  return {
    ...createQueuedAnalysisJobOp({
      iterationId: 1,
      input: { files: [{ path: "a.ts" }] },
      inputFingerprint: "fp-1",
      now: "2026-06-26T00:00:00.000Z",
      jobId: "analysis-1",
      inputSummary: { totalFiles: 1 }
    }),
    ...overrides
  };
}

function setupAnalysisService() {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "t", description: "d", tenantId: "t1", ownerUserId: "u1" });
  const iteration = repo.createIteration(project.id, { name: "iter", description: "d" });
  const transitionStub = () => ({ ok: true });
  return { repo, project, iteration, transitionStub };
}

// ─── 纯函数 markAnalysisJobInterruptedOnRestartOp ───

describe("markAnalysisJobInterruptedOnRestartOp", () => {
  test("重启恢复把 running/queued 的分析任务标记为失败，已完成的任务保持原状", () => {
    const jobs = new Map();
    jobs.set("r", makeRuntimeJob({ jobId: "r", status: "running", startedAt: "2026-06-26T00:00:00.000Z" }));
    jobs.set("q", makeRuntimeJob({ jobId: "q", status: "queued" }));
    jobs.set("s", makeRuntimeJob({ jobId: "s", status: "succeeded", finishedAt: "2026-06-26T00:01:00.000Z" }));
    jobs.set("f", makeRuntimeJob({ jobId: "f", status: "failed", error: "旧错误" }));

    const markedFailed = [];
    const persisted = [];
    const count = markAnalysisJobInterruptedOnRestartOp({
      analysisJobs: jobs,
      onMarkFailed: (iterationId, input, errorMessage, at) =>
        markedFailed.push({ iterationId, input, errorMessage, at }),
      onPersist: (job) => persisted.push(job),
      nowIso: "2026-06-26T12:00:00.000Z"
    });

    assert.equal(count, 2, "应标记 2 个幽灵任务（running + queued）");
    assert.equal(jobs.get("r").status, "failed");
    assert.equal(jobs.get("q").status, "failed");
    assert.ok(jobs.get("r").error.includes("中断"), "error 应含中断原因");
    assert.equal(jobs.get("r").finishedAt, "2026-06-26T12:00:00.000Z");
    assert.equal(jobs.get("r").progress.stageHint, "failed:restart_interrupted");
    assert.equal(jobs.get("s").status, "succeeded", "已成功任务保持原状");
    assert.equal(jobs.get("f").status, "failed", "已失败任务保持原状");
    assert.equal(jobs.get("f").error, "旧错误", "已失败任务的 error 不被覆盖");
    assert.equal(markedFailed.length, 2, "应记录 2 个失败输入快照供重试");
    assert.equal(persisted.length, 2, "应持久化 2 个 job 写回 DB");
  });

  test("无幽灵任务时返回 0 且不调用任何回调", () => {
    const jobs = new Map();
    jobs.set("s", makeRuntimeJob({ jobId: "s", status: "succeeded" }));
    let called = 0;
    const count = markAnalysisJobInterruptedOnRestartOp({
      analysisJobs: jobs,
      onMarkFailed: () => { called += 1; },
      onPersist: () => { called += 1; }
    });
    assert.equal(count, 0);
    assert.equal(called, 0);
  });
});

// ─── AnalysisService 启动恢复集成 ───

describe("AnalysisService 重启恢复幽灵 running", () => {
  test("进程重启后，DB 中 running 的分析任务应被立即标记失败并记录失败输入供重试", () => {
    const { repo, iteration, transitionStub } = setupAnalysisService();
    const input = { files: [{ path: "spec.md" }] };
    const runtimeJob = {
      ...createQueuedAnalysisJobOp({
        iterationId: iteration.id, input, inputFingerprint: "fp-x",
        now: "2026-06-26T00:00:00.000Z", jobId: "analysis-running-1",
        inputSummary: { totalFiles: 1 }
      }),
      status: "running",
      startedAt: "2026-06-26T00:00:30.000Z"
    };
    // 模拟进程重启前 DB 落盘的 running 任务
    repo.saveAnalysisJob(runtimeJob);

    const service = new AnalysisService(repo, transitionStub, null);

    const job = service.analysisJobs.get("analysis-running-1");
    assert.ok(job, "任务应被 restoreFromDb 读回内存");
    assert.equal(job.status, "failed", "幽灵 running 应立即标失败，不等 25min 超时");
    assert.ok(job.error.includes("中断"), "error 应含中断原因");
    assert.equal(job.progress.stageHint, "failed:restart_interrupted");

    // 失败输入快照已记录，供 retryLatestFailedAttachmentAnalysisJob 重跑
    const updated = repo.findIteration(iteration.id);
    assert.ok(
      updated.changeControl.lastFailedAnalysisInput.includes("spec.md"),
      "应记录失败输入供用户手动重试"
    );

    // 审计日志
    const logs = repo.listAuditLogs();
    assert.ok(
      logs.some((l) => l.action === "analysis.restart_recovery"),
      "应写重启恢复审计日志"
    );
  });

  test("已 succeeded/failed 的分析任务重启后保持原状，不写恢复日志", () => {
    const { repo, iteration, transitionStub } = setupAnalysisService();
    repo.saveAnalysisJob({
      ...createQueuedAnalysisJobOp({
        iterationId: iteration.id, input: { files: [] }, inputFingerprint: "fp",
        now: "2026-06-26T00:00:00.000Z", jobId: "ok-1", inputSummary: { totalFiles: 0 }
      }),
      status: "succeeded", finishedAt: "2026-06-26T00:05:00.000Z", result: { analyzedAt: "t" }
    });
    repo.saveAnalysisJob({
      ...createQueuedAnalysisJobOp({
        iterationId: iteration.id, input: { files: [] }, inputFingerprint: "fp2",
        now: "2026-06-26T00:00:00.000Z", jobId: "fail-1", inputSummary: { totalFiles: 0 }
      }),
      status: "failed", finishedAt: "2026-06-26T00:05:00.000Z", error: "旧超时"
    });

    const service = new AnalysisService(repo, transitionStub, null);

    assert.equal(service.analysisJobs.get("ok-1").status, "succeeded");
    assert.equal(service.analysisJobs.get("fail-1").status, "failed");
    assert.equal(service.analysisJobs.get("fail-1").error, "旧超时", "旧 error 不被覆盖");
    assert.ok(
      !repo.listAuditLogs().some((l) => l.action === "analysis.restart_recovery"),
      "无幽灵任务不应写恢复日志"
    );
  });
});
