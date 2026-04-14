import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { QualityService } = await import(
  "../dist/application/workspace/quality/qualityService.js"
);

function setup() {
  const repo = createInMemoryWorkspaceRepo();
  const project = repo.createProject({
    name: "test",
    description: "d",
    tenantId: "t1",
    ownerUserId: "u1",
  });
  const iteration = repo.createIteration(project.id, {
    name: "iter",
    description: "d",
  });
  const service = new QualityService(repo);
  return { repo, project, iteration, service };
}

// ─── getIterationReleaseReview ───

test("getIterationReleaseReview returns release review for existing iteration", () => {
  const { service, iteration } = setup();
  const review = service.getIterationReleaseReview(iteration.id);
  assert.ok(review, "should return a non-null review object");
  assert.equal(review.iterationId, iteration.id);
  assert.ok(typeof review.decision === "string");
  assert.ok(typeof review.score === "number");
  assert.ok(Array.isArray(review.blockers));
  assert.ok(Array.isArray(review.warnings));
  assert.ok(Array.isArray(review.recommendations));
  assert.ok(review.generatedAt);
});

test("getIterationReleaseReview returns null for non-existent iteration", () => {
  const { service } = setup();
  const review = service.getIterationReleaseReview(999999);
  assert.equal(review, null);
});

// ─── generateIterationTestArtifacts ───

test("generateIterationTestArtifacts dryRun returns files list without writing to disk", async () => {
  const { service, iteration } = setup();
  const result = await service.generateIterationTestArtifacts(iteration.id, {
    dryRun: true,
  });
  assert.ok(result, "should return a non-null response");
  assert.equal(result.iterationId, iteration.id);
  assert.equal(result.dryRun, true);
  assert.ok(Array.isArray(result.generatedFiles));
  assert.ok(result.generatedFiles.length > 0, "should plan at least one file");
  assert.ok(typeof result.summary === "string");
});

test("generateIterationTestArtifacts returns null for non-existent iteration", async () => {
  const { service } = setup();
  const result = await service.generateIterationTestArtifacts(999999, {
    dryRun: true,
  });
  assert.equal(result, null);
});

// ─── generateIterationDeliveryPackage ───

test("generateIterationDeliveryPackage dryRun returns delivery package result", async () => {
  const { service, iteration } = setup();
  const result = await service.generateIterationDeliveryPackage(iteration.id, {
    dryRun: true,
  });
  assert.ok(result, "should return a non-null delivery package result");
  assert.equal(result.iterationId, iteration.id);
  assert.equal(result.dryRun, true);
  assert.ok(typeof result.summary === "string");
  assert.ok(Array.isArray(result.reviewReportFiles));
  assert.ok(Array.isArray(result.packageFiles));
  assert.ok(Array.isArray(result.warnings));
});

test("generateIterationDeliveryPackage returns null for non-existent iteration", async () => {
  const { service } = setup();
  const result = await service.generateIterationDeliveryPackage(999999, {
    dryRun: true,
  });
  assert.equal(result, null);
});
