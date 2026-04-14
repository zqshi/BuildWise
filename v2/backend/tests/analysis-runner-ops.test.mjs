import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { runAttachmentAnalysisJobWithTimeoutOp } = await import(
  "../dist/application/workspace/analysis/runnerOps.js"
);

// ─── runAttachmentAnalysisJobWithTimeoutOp ───

describe("runAttachmentAnalysisJobWithTimeoutOp", () => {
  test("job completes within timeout → success, no error", async () => {
    const jobs = new Map();
    jobs.set("j1", {
      iterationId: 1,
      status: "running",
      input: { iterationId: 1, fileName: "f.md", mimeType: "text/plain", excerpt: "x" },
      finishedAt: "",
      error: "",
      progress: { percent: 0, stageHint: "running" }
    });
    let called = false;
    await runAttachmentAnalysisJobWithTimeoutOp({
      analysisJobs: jobs,
      jobId: "j1",
      analysisJobTimeoutMs: 5000,
      runAttachmentAnalysisJob: async () => { called = true; },
      onMarkFailed: () => {}
    });
    assert.ok(called);
    assert.equal(jobs.get("j1").status, "running"); // not changed by wrapper
  });

  test("job times out → marks job as failed, throws error", async () => {
    const jobs = new Map();
    jobs.set("j2", {
      iterationId: 1,
      status: "running",
      input: { iterationId: 1, fileName: "f.md", mimeType: "text/plain", excerpt: "x" },
      finishedAt: "",
      error: "",
      progress: { percent: 0, stageHint: "running" }
    });
    let markFailedCalled = false;
    await assert.rejects(
      () => runAttachmentAnalysisJobWithTimeoutOp({
        analysisJobs: jobs,
        jobId: "j2",
        analysisJobTimeoutMs: 50,
        runAttachmentAnalysisJob: () => new Promise(resolve => setTimeout(resolve, 5000)),
        onMarkFailed: () => { markFailedCalled = true; }
      }),
      { message: /timeout/ }
    );
    assert.equal(jobs.get("j2").status, "failed");
    assert.ok(markFailedCalled);
  });

  test("job throws error → marks job as failed, rethrows", async () => {
    const jobs = new Map();
    jobs.set("j3", {
      iterationId: 1,
      status: "running",
      input: { iterationId: 1, fileName: "f.md", mimeType: "text/plain", excerpt: "x" },
      finishedAt: "",
      error: "",
      progress: { percent: 0, stageHint: "running" }
    });
    await assert.rejects(
      () => runAttachmentAnalysisJobWithTimeoutOp({
        analysisJobs: jobs,
        jobId: "j3",
        analysisJobTimeoutMs: 5000,
        runAttachmentAnalysisJob: async () => { throw new Error("api_error"); },
        onMarkFailed: () => {}
      }),
      { message: "api_error" }
    );
    assert.equal(jobs.get("j3").status, "failed");
  });

  test("job already completed when error hits → does not re-mark", async () => {
    const jobs = new Map();
    jobs.set("j4", {
      iterationId: 1,
      status: "succeeded",
      input: { iterationId: 1, fileName: "f.md", mimeType: "text/plain", excerpt: "x" },
      finishedAt: "2025-01-01",
      error: "",
      progress: { percent: 100, stageHint: "done" }
    });
    await assert.rejects(
      () => runAttachmentAnalysisJobWithTimeoutOp({
        analysisJobs: jobs,
        jobId: "j4",
        analysisJobTimeoutMs: 5000,
        runAttachmentAnalysisJob: async () => { throw new Error("late_error"); },
        onMarkFailed: () => {}
      })
    );
    assert.equal(jobs.get("j4").status, "succeeded"); // unchanged
  });
});
