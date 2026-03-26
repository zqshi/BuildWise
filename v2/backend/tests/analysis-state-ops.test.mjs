import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const {
  isDuplicateAttachmentUploadOp,
  hasPendingDuplicateJobOp,
  findPendingDuplicateJobOp,
  recordAttachmentInputFingerprintOp,
  persistRetryableAnalysisInputOp,
  markFailedAnalysisOp
} = await import(
  "../dist/application/workspace/workspaceServiceAnalysisStateOps.js"
);

// ─── helpers ───

function setupRepoWithIteration() {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({ name: "test", description: "d", tenantId: "t1", ownerUserId: "u1" });
  const iteration = repo.createIteration(project.id, { name: "iter", description: "d" });
  return { repo, project, iteration };
}

// ─── isDuplicateAttachmentUploadOp ───

describe("isDuplicateAttachmentUploadOp", () => {
  test("iteration not found returns false", () => {
    const repo = createInMemoryWorkspaceRepo();
    assert.equal(isDuplicateAttachmentUploadOp(repo, 9999, "fp-abc"), false);
  });

  test("iteration has no changeControl returns false", () => {
    const { repo, iteration } = setupRepoWithIteration();
    assert.equal(isDuplicateAttachmentUploadOp(repo, iteration.id, "fp-abc"), false);
  });

  test("matching fingerprint returns true", () => {
    const { repo, iteration } = setupRepoWithIteration();
    iteration.changeControl = { lastUploadedInputFingerprint: "fp-abc" };
    repo.updateIteration(iteration);
    assert.equal(isDuplicateAttachmentUploadOp(repo, iteration.id, "fp-abc"), true);
  });

  test("different fingerprint returns false", () => {
    const { repo, iteration } = setupRepoWithIteration();
    iteration.changeControl = { lastUploadedInputFingerprint: "fp-abc" };
    repo.updateIteration(iteration);
    assert.equal(isDuplicateAttachmentUploadOp(repo, iteration.id, "fp-xyz"), false);
  });
});

// ─── hasPendingDuplicateJobOp ───

describe("hasPendingDuplicateJobOp", () => {
  test("empty jobs returns false", () => {
    assert.equal(hasPendingDuplicateJobOp([], 1, "fp-abc"), false);
  });

  test("matching queued job returns true", () => {
    const jobs = [{ iterationId: 1, status: "queued", inputFingerprint: "fp-abc" }];
    assert.equal(hasPendingDuplicateJobOp(jobs, 1, "fp-abc"), true);
  });

  test("matching running job returns true", () => {
    const jobs = [{ iterationId: 1, status: "running", inputFingerprint: "fp-abc" }];
    assert.equal(hasPendingDuplicateJobOp(jobs, 1, "fp-abc"), true);
  });

  test("same fingerprint but completed returns false", () => {
    const jobs = [{ iterationId: 1, status: "completed", inputFingerprint: "fp-abc" }];
    assert.equal(hasPendingDuplicateJobOp(jobs, 1, "fp-abc"), false);
  });

  test("different iterationId returns false", () => {
    const jobs = [{ iterationId: 2, status: "queued", inputFingerprint: "fp-abc" }];
    assert.equal(hasPendingDuplicateJobOp(jobs, 1, "fp-abc"), false);
  });
});

// ─── findPendingDuplicateJobOp ───

describe("findPendingDuplicateJobOp", () => {
  test("found returns the job object", () => {
    const job = { iterationId: 1, status: "queued", inputFingerprint: "fp-abc" };
    const result = findPendingDuplicateJobOp([job], 1, "fp-abc");
    assert.equal(result, job);
  });

  test("not found returns null", () => {
    const jobs = [{ iterationId: 1, status: "completed", inputFingerprint: "fp-abc" }];
    assert.equal(findPendingDuplicateJobOp(jobs, 1, "fp-abc"), null);
  });
});

// ─── recordAttachmentInputFingerprintOp ───

describe("recordAttachmentInputFingerprintOp", () => {
  test("records fingerprint on existing iteration", () => {
    const { repo, iteration } = setupRepoWithIteration();
    const ts = "2026-03-25T00:00:00.000Z";
    recordAttachmentInputFingerprintOp(repo, iteration.id, "fp-abc", ts);
    const updated = repo.findIteration(iteration.id);
    assert.equal(updated.changeControl.lastUploadedInputFingerprint, "fp-abc");
    assert.equal(updated.changeControl.lastUploadedAt, ts);
  });

  test("iteration not found is a no-op (no throw)", () => {
    const repo = createInMemoryWorkspaceRepo();
    assert.doesNotThrow(() => {
      recordAttachmentInputFingerprintOp(repo, 9999, "fp-abc");
    });
  });
});

// ─── persistRetryableAnalysisInputOp ───

describe("persistRetryableAnalysisInputOp", () => {
  test("stores input on existing iteration", () => {
    const { repo, iteration } = setupRepoWithIteration();
    const input = { sourceType: "single-file", fileName: "a.ts" };
    const ts = "2026-03-25T00:00:00.000Z";
    persistRetryableAnalysisInputOp(repo, iteration.id, input, ts);
    const updated = repo.findIteration(iteration.id);
    assert.equal(updated.changeControl.lastFailedAnalysisInput, JSON.stringify(input));
    assert.equal(updated.changeControl.lastFailedAnalysisAt, ts);
    assert.equal(updated.changeControl.lastFailedAnalysisError, "");
  });

  test("iteration not found is a no-op (no throw)", () => {
    const repo = createInMemoryWorkspaceRepo();
    assert.doesNotThrow(() => {
      persistRetryableAnalysisInputOp(repo, 9999, { sourceType: "single-file" });
    });
  });
});

// ─── markFailedAnalysisOp ───

describe("markFailedAnalysisOp", () => {
  test("records error message and input", () => {
    const { repo, iteration } = setupRepoWithIteration();
    const input = { sourceType: "folder", folderName: "src" };
    const ts = "2026-03-25T00:00:00.000Z";
    markFailedAnalysisOp(repo, iteration.id, input, "token limit exceeded", ts);
    const updated = repo.findIteration(iteration.id);
    assert.equal(updated.changeControl.lastFailedAnalysisInput, JSON.stringify(input));
    assert.equal(updated.changeControl.lastFailedAnalysisAt, ts);
    assert.equal(updated.changeControl.lastFailedAnalysisError, "token limit exceeded");
  });

  test("iteration not found is a no-op (no throw)", () => {
    const repo = createInMemoryWorkspaceRepo();
    assert.doesNotThrow(() => {
      markFailedAnalysisOp(repo, 9999, { sourceType: "single-file" }, "boom");
    });
  });
});
