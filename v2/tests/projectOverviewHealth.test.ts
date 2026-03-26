import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectModelBusinessSummaryFromView, computeProjectOverviewHealthScore } from "../src/pages/projects/projectOverviewPanelHelpers.ts";

test("computeProjectOverviewHealthScore derives score from live project signals", () => {
  const score = computeProjectOverviewHealthScore({
    projectProgress: 4,
    modelRuleCount: 0,
    modelEntityCount: 0,
    modelRelationCount: 0,
    modelPageCount: 0,
    repoHealth: {
      remoteConfigured: false,
      remoteReachable: false,
      remoteSynced: false
    },
    runtimeStatus: "ok"
  });

  // projectProgress 4 → Math.round(4*0.2) = 1, runtimeStatus "ok" → 5, total = 6
  assert.equal(score, 6);
});

test("buildProjectModelBusinessSummaryFromView derives summary from unified model view", () => {
  const summary = buildProjectModelBusinessSummaryFromView({
    projectId: 3,
    iterationId: 8,
    generatedAt: "2026-03-24T09:30:00.000Z",
    view: {
      projectName: "构想智造平台",
      iterationName: "供应链协同",
      iterationStatus: "in-progress",
      entities: [
        { id: "entity_order", name: "Order", businessName: "订单", fields: [] },
        { id: "entity_supplier", name: "Supplier", businessName: "供应商", fields: [] }
      ],
      relations: [{ id: "rel-1", fromEntityId: "entity_order", toEntityId: "entity_supplier", type: "one_to_many" }],
      rules: [{ id: "rule-1", name: "订单必须关联供应商", source: "snapshot", linkedEntityIds: ["entity_order"], linkedSurfaceIds: [], linkedApiIds: [] }],
      reviewTasks: [{ id: "task-1", title: "确认订单与供应商约束", description: "desc", blocking: true, type: "rule_confirmation" }],
      ontologyTerms: [],
      evidence: ["snapshot:snapshot-8"],
      latestSnapshotId: "snapshot-8",
      latestSnapshotStatus: "published"
    }
  });

  assert.equal(summary?.source, "derived");
  assert.equal(summary?.projectId, 3);
  assert.equal(summary?.iterationId, 8);
  assert.match(summary?.model || "", /2 个实体/);
  assert.match(summary?.summary || "", /构想智造平台/);
  assert.deepEqual(summary?.risks, ["确认订单与供应商约束"]);
});
