import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { ChangeControlService } = await import(
  "../dist/application/workspace/changeControl/changeControlService.js"
);

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
let repo;
let project;
let iteration;
let service;

function setup() {
  repo = createInMemoryWorkspaceRepo();
  project = repo.createProject({
    name: "test",
    description: "d",
    tenantId: "t1",
    ownerUserId: "u1",
  });
  iteration = repo.createIteration(project.id, {
    name: "iter",
    description: "d",
  });
  service = new ChangeControlService(repo);
}

// ---------------------------------------------------------------------------
// 1. getIterationChangeControl
// ---------------------------------------------------------------------------
describe("getIterationChangeControl", () => {
  beforeEach(() => setup());

  test("existing iteration returns change control object", () => {
    const cc = service.getIterationChangeControl(iteration.id);
    assert.notEqual(cc, null);
    assert.equal(typeof cc, "object");
  });

  test("non-existent iteration returns null", () => {
    const cc = service.getIterationChangeControl(999999);
    assert.equal(cc, null);
  });
});

// ---------------------------------------------------------------------------
// 2. getIterationArtifactWorkflow
// ---------------------------------------------------------------------------
describe("getIterationArtifactWorkflow", () => {
  beforeEach(() => setup());

  test("existing iteration returns workflow object", () => {
    const wf = service.getIterationArtifactWorkflow(iteration.id);
    assert.notEqual(wf, null);
    assert.equal(typeof wf, "object");
    assert.ok(Array.isArray(wf.items));
  });

  test("non-existent iteration returns null", () => {
    const wf = service.getIterationArtifactWorkflow(999999);
    assert.equal(wf, null);
  });
});

// ---------------------------------------------------------------------------
// 3. confirmIterationAnalysis
// ---------------------------------------------------------------------------
describe("confirmIterationAnalysis", () => {
  beforeEach(() => setup());

  test("accurate=true returns ok and updates changeControl", () => {
    const result = service.confirmIterationAnalysis(iteration.id, {
      accurate: true,
      actor: "tester",
    });
    assert.equal(result.ok, true);
    const cc = service.getIterationChangeControl(iteration.id);
    assert.equal(cc.pendingHumanConfirmation, false);
    assert.ok(cc.confirmedAt);
    assert.equal(cc.confirmedBy, "tester");
  });

  test("accurate=false returns ok with clarification round increment", () => {
    const result = service.confirmIterationAnalysis(iteration.id, {
      accurate: false,
      note: "need more details",
    });
    assert.equal(result.ok, true);
    const cc = service.getIterationChangeControl(iteration.id);
    assert.equal(cc.pendingHumanConfirmation, true);
    assert.ok(cc.clarificationRounds >= 1);
  });

  test("non-existent iteration returns ok=false with reason", () => {
    const result = service.confirmIterationAnalysis(999999, {
      accurate: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "iteration_not_found");
  });
});

// ---------------------------------------------------------------------------
// 4. saveIterationArtifactDraft
// ---------------------------------------------------------------------------
describe("saveIterationArtifactDraft", () => {
  beforeEach(() => setup());

  test("saves draft content and is retrievable via getIterationArtifactWorkflow", () => {
    // Ensure workflow is initialised so artifact ids exist
    const wf = service.getIterationArtifactWorkflow(iteration.id);
    assert.ok(wf.items.length > 0, "workflow should have at least one item");
    const artifactId = wf.items[0].id;

    const saved = service.saveIterationArtifactDraft(
      iteration.id,
      artifactId,
      { content: "这是一段足够长的交付物草稿内容，用于测试保存和检索功能。此段内容需要超过一百个字符长度，以避免被自动合成逻辑覆盖。内容覆盖完整的需求分析报告初稿，包含功能点、变更边界和风险评估三个维度的详细说明和验收标准定义。", actor: "author" }
    );
    assert.ok(saved, "saveIterationArtifactDraft should return workflow");

    const wf2 = service.getIterationArtifactWorkflow(iteration.id);
    const item = wf2.items.find((i) => i.id === artifactId);
    assert.ok(item.draft.content.includes("足够长的交付物草稿内容"));
    assert.equal(item.draft.updatedBy, "author");
  });
});

// ---------------------------------------------------------------------------
// 5. updateIterationBoundary
// ---------------------------------------------------------------------------
describe("updateIterationBoundary", () => {
  beforeEach(() => setup());

  test("updates boundary fields on change control", () => {
    const result = service.updateIterationBoundary(iteration.id, {
      requirementRefs: ["REQ-001", "REQ-002"],
      componentRefs: ["auth-module"],
      codePaths: ["src/auth/"],
      note: "scope locked",
    });
    assert.notEqual(result, null);
    assert.deepStrictEqual(result.boundary.requirementRefs, [
      "REQ-001",
      "REQ-002",
    ]);
    assert.deepStrictEqual(result.boundary.componentRefs, ["auth-module"]);
    assert.deepStrictEqual(result.boundary.codePaths, ["src/auth/"]);
    assert.equal(result.boundary.note, "scope locked");
  });
});

// ---------------------------------------------------------------------------
// 6. updateClarificationDraft
// ---------------------------------------------------------------------------
describe("updateClarificationDraft", () => {
  beforeEach(() => setup());

  test("updates resolved questions list", () => {
    // Seed some clarification questions first via a not-accurate confirmation
    service.confirmIterationAnalysis(iteration.id, {
      accurate: false,
      note: "unclear",
    });
    // Fetch current questions (may be empty since the system doesn't auto-generate)
    const cc = service.getIterationChangeControl(iteration.id);
    const questions = cc.clarificationQuestions || [];

    // Even with empty questions, the operation should succeed and store []
    const updated = service.updateClarificationDraft(iteration.id, questions);
    assert.notEqual(updated, null);
    assert.ok(
      Array.isArray(updated.clarificationDraftResolvedQuestions),
      "should contain resolvedQuestions array"
    );
  });
});

// ---------------------------------------------------------------------------
// 7. bindIterationCodeLink
// ---------------------------------------------------------------------------
describe("bindIterationCodeLink", () => {
  beforeEach(() => setup());

  test("binds code link with branch/commit and verifiable via getIterationCodeLink", () => {
    const link = service.bindIterationCodeLink(iteration.id, {
      branch: "feature/test-123",
      commit: "abc1234",
    });
    assert.notEqual(link, null);
    assert.equal(link.branch, "feature/test-123");
    assert.equal(link.commit, "abc1234");

    const fetched = service.getIterationCodeLink(iteration.id);
    assert.equal(fetched.branch, "feature/test-123");
    assert.equal(fetched.commit, "abc1234");
  });
});

// ---------------------------------------------------------------------------
// 8. getIterationCodeLink
// ---------------------------------------------------------------------------
describe("getIterationCodeLink", () => {
  beforeEach(() => setup());

  test("returns null when no code link bound", () => {
    const link = service.getIterationCodeLink(iteration.id);
    assert.equal(link, null);
  });

  test("returns code link after binding", () => {
    service.bindIterationCodeLink(iteration.id, {
      branch: "main",
      commit: "deadbeef",
    });
    const link = service.getIterationCodeLink(iteration.id);
    assert.notEqual(link, null);
    assert.equal(link.branch, "main");
    assert.equal(link.commit, "deadbeef");
  });
});
