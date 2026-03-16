import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIterationGuidance,
  buildIterationMetrics,
  selectCoreDeliverables,
  summarizeArtifactProgress
} from "../src/pages/projects/iterationInsightModel.ts";

const artifactItems = [
  { id: "a1", stage: "clarification", status: "partial", gateStatus: "pending", stale: false, title: "分析", summary: "", source: "", category: "", description: "", inputVersionRef: 1, outputVersion: 1, downstreamImpacts: [], editCapability: "rich-text", evidence: [], draft: { content: "", media: [], updatedAt: "", updatedBy: "" }, lastConfirmedBy: "", lastConfirmedAt: "", updatedAt: "" },
  { id: "a2", stage: "scope", status: "pending", gateStatus: "blocked", stale: false, title: "边界", summary: "", source: "", category: "", description: "", inputVersionRef: 1, outputVersion: 1, downstreamImpacts: [], editCapability: "rich-text", evidence: [], draft: { content: "", media: [], updatedAt: "", updatedBy: "" }, lastConfirmedBy: "", lastConfirmedAt: "", updatedAt: "" },
  { id: "a3", stage: "clarification", status: "ready", gateStatus: "passed", stale: false, title: "报告", summary: "", source: "", category: "", description: "", inputVersionRef: 1, outputVersion: 1, downstreamImpacts: [], editCapability: "rich-text", evidence: [], draft: { content: "", media: [], updatedAt: "", updatedBy: "" }, lastConfirmedBy: "", lastConfirmedAt: "", updatedAt: "" }
] as const;

test("selectCoreDeliverables prioritizes active-stage and blocked items", () => {
  const rows = selectCoreDeliverables(artifactItems as never, "clarification", 3);
  assert.deepEqual(
    rows.map((item) => item.id),
    ["a1", "a3", "a2"]
  );
});

test("summarizeArtifactProgress returns status counts", () => {
  const summary = summarizeArtifactProgress(artifactItems as never);
  assert.equal(summary.total, 3);
  assert.equal(summary.ready, 1);
  assert.equal(summary.partial, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.blocked, 1);
});

test("buildIterationMetrics derives rows from actual progress", () => {
  const metrics = buildIterationMetrics({
    iteration: {
      changeControl: {
        clarificationQuestions: ["Q1", "Q2"],
        pendingHumanConfirmation: true
      }
    } as never,
    analysisReport: {
      prioritizedFindings: [{ priority: "P0" }, { priority: "P2" }]
    } as never,
    matrixSummary: {
      total: 10,
      executed: 8,
      passed: 7,
      failed: 1,
      blocked: 0,
      skipped: 0,
      coverage: 80,
      passRate: 88
    },
    materialRisks: ["risk-a"],
    materialSuggestions: ["todo-a", "todo-b"],
    recentTransitionCount: 2,
    artifactItems: artifactItems as never
  });
  const ids = metrics.map((item) => item.id);
  assert.ok(ids.includes("artifact-progress"));
  assert.ok(ids.includes("test-coverage"));
  assert.ok(ids.includes("risk-count"));
  assert.ok(ids.includes("clarification"));
  assert.ok(ids.includes("high-value"));
});

test("buildIterationGuidance returns natural-language guidance and actions", () => {
  const guidance = buildIterationGuidance({
    iteration: { status: "in-progress", changeControl: { clarificationQuestions: ["Q1"] } } as never,
    analysisReport: null,
    stateMachine: { allowedTransitions: ["review"] } as never,
    matrixSummary: { total: 0, executed: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, coverage: 100, passRate: 100 },
    materialRisks: [],
    artifactItems: artifactItems as never,
    activeStage: "clarification"
  });
  assert.match(guidance.narrative, /对话确认/);
  assert.ok(guidance.quickActions.includes("上传附件并触发分析"));
  assert.equal(guidance.quickActions[0], "流转到评审中");
});

test("buildIterationGuidance uses cyclePhase template and blocked narrative", () => {
  const guidance = buildIterationGuidance({
    iteration: { status: "blocked", changeControl: { clarificationQuestions: [] } } as never,
    analysisReport: { cyclePhase: "qa-review" } as never,
    stateMachine: { allowedTransitions: [] } as never,
    matrixSummary: { total: 12, executed: 12, passed: 9, failed: 2, blocked: 1, skipped: 0, coverage: 100, passRate: 75 },
    materialRisks: ["risk-a"],
    artifactItems: artifactItems as never,
    activeStage: "testing"
  });
  assert.match(guidance.checkpoints[0], /阻塞中/);
  assert.match(guidance.checkpoints[1], /质量评审窗口/);
});
