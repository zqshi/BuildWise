import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildClarificationQuestionsOp,
  mergeSynthesisResultsOp
} from "../dist/application/workspace/analysis/synthesisOps.js";

import {
  createQueuedAnalysisJobOp,
  reconcileAnalysisJobsOp
} from "../dist/application/workspace/analysis/queueOps.js";

// ---------------------------------------------------------------------------
// buildClarificationQuestionsOp
// ---------------------------------------------------------------------------

describe("buildClarificationQuestionsOp", () => {
  test("non-degraded guardrail with low unknown signals returns minimal or empty array", () => {
    const result = buildClarificationQuestionsOp({
      guardrail: { degraded: false, reason: "" },
      unknownSignalCount: 0,
      unknownSignalThreshold: 5,
      strategy: "direct",
      diffLocations: [{ dimension: "inScope", changeType: "added", currentItem: "新功能" }]
    });
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  test("degraded guardrail includes question about degraded state", () => {
    const result = buildClarificationQuestionsOp({
      guardrail: { degraded: true, reason: "token-limit-exceeded" },
      unknownSignalCount: 0,
      unknownSignalThreshold: 5,
      strategy: "direct",
      diffLocations: [{ dimension: "goals", changeType: "changed", currentItem: "目标调整" }]
    });
    assert.ok(result.length >= 1);
    assert.ok(result.some((q) => q.includes("存在局限")));
  });

  test("unknownSignalCount >= threshold includes question about unknown signals", () => {
    const result = buildClarificationQuestionsOp({
      guardrail: { degraded: false, reason: "" },
      unknownSignalCount: 10,
      unknownSignalThreshold: 5,
      strategy: "direct",
      diffLocations: [{ dimension: "inScope", changeType: "added", currentItem: "X" }]
    });
    assert.ok(result.some((q) => q.includes("置信度较低")));
  });

  test("empty diffLocations still works and includes question about missing diff", () => {
    const result = buildClarificationQuestionsOp({
      guardrail: { degraded: false, reason: "" },
      unknownSignalCount: 0,
      unknownSignalThreshold: 5,
      strategy: "direct",
      diffLocations: []
    });
    assert.ok(Array.isArray(result));
    assert.ok(result.some((q) => q.includes("未识别到明确差异")));
  });

  test("result is always de-duplicated", () => {
    const result = buildClarificationQuestionsOp({
      guardrail: { degraded: true, reason: "dup-test" },
      unknownSignalCount: 10,
      unknownSignalThreshold: 5,
      strategy: "binary-no-text",
      diffLocations: []
    });
    const unique = new Set(result);
    assert.equal(result.length, unique.size);
  });
});

// ---------------------------------------------------------------------------
// mergeSynthesisResultsOp
// ---------------------------------------------------------------------------

describe("mergeSynthesisResultsOp", () => {
  const makeBase = () => ({
    projectDetection: {
      projectName: "BaseProject",
      productName: "BaseProduct",
      projectCategory: "web-app",
      evidence: ["evidence-1"],
      confidence: "low"
    },
    meaningfulFindings: ["finding-base"],
    prioritizedFindings: [{ priority: "P1", content: "base-content", reason: "base-reason" }],
    nextActions: ["action-base"]
  });

  test("empty syntheses array returns base unchanged", () => {
    const base = makeBase();
    const result = mergeSynthesisResultsOp(base, []);
    assert.equal(result.projectDetection.projectName, "BaseProject");
    assert.deepEqual(result.meaningfulFindings, ["finding-base"]);
    assert.equal(result.prioritizedFindings.length, 1);
    assert.deepEqual(result.nextActions, ["action-base"]);
  });

  test("single synthesis with additional findings is merged into result", () => {
    const base = makeBase();
    const result = mergeSynthesisResultsOp(base, [
      {
        projectDetection: {
          projectName: "MergedProject",
          productName: "MergedProduct",
          projectCategory: "mobile-app",
          evidence: ["evidence-2"],
          confidence: "high"
        },
        meaningfulFindings: ["finding-extra"],
        prioritizedFindings: [{ priority: "P2", content: "extra-content", reason: "extra-reason" }],
        nextActions: ["action-extra"]
      }
    ]);
    assert.equal(result.projectDetection.projectName, "MergedProject");
    assert.equal(result.projectDetection.confidence, "high");
    assert.ok(result.meaningfulFindings.includes("finding-base"));
    assert.ok(result.meaningfulFindings.includes("finding-extra"));
    assert.ok(result.nextActions.includes("action-extra"));
    assert.ok(result.prioritizedFindings.some((f) => f.content === "extra-content"));
  });

  test("findings are de-duplicated", () => {
    const base = makeBase();
    const result = mergeSynthesisResultsOp(base, [
      {
        projectDetection: null,
        meaningfulFindings: ["finding-base", "finding-base"],
        prioritizedFindings: [{ priority: "P1", content: "base-content", reason: "base-reason" }],
        nextActions: ["action-base"]
      }
    ]);
    const findingCounts = result.meaningfulFindings.filter((f) => f === "finding-base").length;
    assert.equal(findingCounts, 1);
    const actionCounts = result.nextActions.filter((a) => a === "action-base").length;
    assert.equal(actionCounts, 1);
  });

  test("null fields in synthesis items are skipped gracefully", () => {
    const base = makeBase();
    const result = mergeSynthesisResultsOp(base, [
      {
        projectDetection: null,
        meaningfulFindings: null,
        prioritizedFindings: null,
        nextActions: null
      }
    ]);
    assert.equal(result.projectDetection.projectName, "BaseProject");
    assert.deepEqual(result.meaningfulFindings, ["finding-base"]);
    assert.equal(result.prioritizedFindings.length, 1);
    assert.deepEqual(result.nextActions, ["action-base"]);
  });

  test("multiple syntheses are all merged", () => {
    const base = makeBase();
    const result = mergeSynthesisResultsOp(base, [
      {
        projectDetection: null,
        meaningfulFindings: ["finding-A"],
        prioritizedFindings: [{ priority: "P2", content: "content-A", reason: "reason-A" }],
        nextActions: ["action-A"]
      },
      {
        projectDetection: { projectName: "FinalName", productName: "", projectCategory: "", evidence: [], confidence: "medium" },
        meaningfulFindings: ["finding-B"],
        prioritizedFindings: [{ priority: "P3", content: "content-B", reason: "reason-B" }],
        nextActions: ["action-B"]
      }
    ]);
    assert.equal(result.projectDetection.projectName, "FinalName");
    assert.equal(result.projectDetection.confidence, "medium");
    assert.ok(result.meaningfulFindings.includes("finding-A"));
    assert.ok(result.meaningfulFindings.includes("finding-B"));
    assert.ok(result.nextActions.includes("action-A"));
    assert.ok(result.nextActions.includes("action-B"));
    assert.equal(result.prioritizedFindings.length, 3);
  });
});

// ---------------------------------------------------------------------------
// createQueuedAnalysisJobOp
// ---------------------------------------------------------------------------

describe("createQueuedAnalysisJobOp", () => {
  const makeParams = (overrides = {}) => ({
    iterationId: 42,
    input: { fileName: "req.md", mimeType: "text/markdown", size: 1024, excerpt: "需求文档" },
    inputFingerprint: "sha256-abc123",
    now: "2026-03-25T10:00:00.000Z",
    jobId: "job-001",
    inputSummary: { fileName: "req.md", sourceType: "single-file", folderName: "", totalFiles: 1, totalBytes: 1024 },
    ...overrides
  });

  test("returns valid job with status queued", () => {
    const job = createQueuedAnalysisJobOp(makeParams());
    assert.equal(job.status, "queued");
    assert.equal(job.createdAt, "2026-03-25T10:00:00.000Z");
    assert.equal(job.startedAt, "");
    assert.equal(job.finishedAt, "");
    assert.equal(job.error, "");
    assert.equal(job.result, null);
    assert.ok(Array.isArray(job.warnings));
  });

  test("job has correct iterationId, jobId, inputFingerprint", () => {
    const job = createQueuedAnalysisJobOp(makeParams());
    assert.equal(job.iterationId, 42);
    assert.equal(job.jobId, "job-001");
    assert.equal(job.inputFingerprint, "sha256-abc123");
  });

  test("progress.percent is 0 and stageHint is queued", () => {
    const job = createQueuedAnalysisJobOp(makeParams());
    assert.equal(job.progress.processedFiles, 0);
    assert.equal(job.progress.stageHint, "queued");
    assert.equal(job.progress.totalFiles, 1);
  });
});

// ---------------------------------------------------------------------------
// reconcileAnalysisJobsOp
// ---------------------------------------------------------------------------

describe("reconcileAnalysisJobsOp", () => {
  const STALL_TIMEOUT = 30_000;
  const JOB_TIMEOUT = 120_000;

  const makeJob = (overrides = {}) => ({
    jobId: "j1",
    iterationId: 1,
    status: "queued",
    createdAt: "2026-03-25T10:00:00.000Z",
    startedAt: "",
    finishedAt: "",
    inputSummary: { fileName: "f.md", sourceType: "single-file", folderName: "", totalFiles: 1, totalBytes: 100 },
    progress: { totalFiles: 1, processedFiles: 0, totalBatches: 0, completedBatches: 0, failedBatches: 0, retriedBatches: 0, stageHint: "queued" },
    warnings: [],
    error: "",
    result: null,
    input: { fileName: "f.md", mimeType: "text/markdown", size: 100, excerpt: "x" },
    inputFingerprint: "fp",
    ...overrides
  });

  test("empty map returns 0", () => {
    const count = reconcileAnalysisJobsOp({
      analysisJobs: new Map(),
      analysisQueuedStallTimeoutMs: STALL_TIMEOUT,
      analysisJobTimeoutMs: JOB_TIMEOUT
    });
    assert.equal(count, 0);
  });

  test("running job within timeout returns 1 and job unchanged", () => {
    const now = new Date("2026-03-25T10:01:00.000Z");
    const job = makeJob({ status: "running", startedAt: "2026-03-25T10:00:30.000Z" });
    const jobs = new Map([["j1", job]]);
    const count = reconcileAnalysisJobsOp({
      analysisJobs: jobs,
      analysisQueuedStallTimeoutMs: STALL_TIMEOUT,
      analysisJobTimeoutMs: JOB_TIMEOUT,
      nowMs: now.getTime()
    });
    assert.equal(count, 1);
    assert.equal(job.status, "running");
  });

  test("running job past timeout returns 0 and job.status becomes failed", () => {
    const startedAt = "2026-03-25T10:00:00.000Z";
    const nowMs = new Date(startedAt).getTime() + JOB_TIMEOUT + 1;
    const job = makeJob({ status: "running", startedAt });
    const jobs = new Map([["j1", job]]);
    const count = reconcileAnalysisJobsOp({
      analysisJobs: jobs,
      analysisQueuedStallTimeoutMs: STALL_TIMEOUT,
      analysisJobTimeoutMs: JOB_TIMEOUT,
      nowMs
    });
    assert.equal(count, 0);
    assert.equal(job.status, "failed");
    assert.ok(job.error.includes("超时"));
    assert.equal(job.progress.stageHint, "failed:running_timeout");
  });

  test("queued job past stall timeout becomes failed", () => {
    const createdAt = "2026-03-25T10:00:00.000Z";
    const nowMs = new Date(createdAt).getTime() + STALL_TIMEOUT + 1;
    const job = makeJob({ status: "queued", createdAt });
    const jobs = new Map([["j1", job]]);
    reconcileAnalysisJobsOp({
      analysisJobs: jobs,
      analysisQueuedStallTimeoutMs: STALL_TIMEOUT,
      analysisJobTimeoutMs: JOB_TIMEOUT,
      nowMs
    });
    assert.equal(job.status, "failed");
    assert.ok(job.error.includes("等待超时"));
    assert.equal(job.progress.stageHint, "failed:queued_stall");
  });
});
