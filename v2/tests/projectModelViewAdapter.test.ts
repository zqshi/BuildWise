import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelOperationalSignals,
  toModelRelationsFromView,
  toModelRuleDescriptionsFromView
} from "../src/pages/projects/projectModelViewAdapter.ts";

test("projectModelViewAdapter converts unified model view into relation payloads", () => {
  const relations = toModelRelationsFromView({
    projectId: 1,
    projectName: "统一建模项目",
    projectDescription: "desc",
    iterationId: 2,
    iterationName: "客户标签",
    iterationStatus: "in-progress",
    latestSnapshotId: "snapshot-1-2",
    latestSnapshotStatus: "candidate",
    ontologyTerms: [],
    rules: [],
    entities: [],
    relations: [
      {
        id: "rel-1",
        fromEntityId: "entity_customer",
        toEntityId: "entity_customer_tag",
        type: "one_to_many",
        businessMeaning: "客户可以拥有多个标签"
      }
    ],
    reviewTasks: [],
    evidence: ["snapshot:snapshot-1-2", "iteration:2"]
  });

  assert.equal(relations.length, 1);
  assert.equal(relations[0]?.name, "客户可以拥有多个标签");
  assert.equal(relations[0]?.ontologyBasis, "snapshot-1-2");
  assert.deepEqual(relations[0]?.dataBasis, ["snapshot:snapshot-1-2", "iteration:2"]);
});

test("projectModelViewAdapter prefers formal rules from unified model view", () => {
  const rules = toModelRuleDescriptionsFromView({
    projectId: 1,
    projectName: "统一建模项目",
    projectDescription: "desc",
    iterationId: 2,
    iterationName: "客户标签",
    iterationStatus: "in-progress",
    latestSnapshotId: "snapshot-1-2",
    latestSnapshotStatus: "candidate",
    ontologyTerms: [],
    rules: [
      {
        id: "rule-1",
        name: "客户标签变更必须留痕",
        statement: "客户标签变更必须留痕",
        source: "snapshot",
        linkedEntityIds: ["entity_customer"],
        linkedSurfaceIds: [],
        linkedApiIds: []
      }
    ],
    entities: [],
    relations: [],
    reviewTasks: [],
    evidence: []
  });

  assert.deepEqual(rules, ["客户标签变更必须留痕"]);
});

test("projectModelViewAdapter builds operational signals from unified model view", () => {
  const signals = buildModelOperationalSignals({
    projectId: 1,
    projectName: "统一建模项目",
    projectDescription: "desc",
    iterationId: 2,
    iterationName: "客户标签",
    iterationStatus: "in-progress",
    latestSnapshotId: null,
    latestSnapshotStatus: "none",
    ontologyTerms: [],
    rules: [],
    entities: [],
    relations: [],
    reviewTasks: [
      {
        id: "review-1",
        type: "rule_confirmation",
        title: "确认客户标签留痕规则",
        description: "desc",
        blocking: true
      },
      {
        id: "review-2",
        type: "term_confirmation",
        title: "确认客户标签术语",
        description: "desc",
        blocking: false
      }
    ],
    evidence: ["snapshot:snapshot-1-2", "iteration:2"]
  });

  assert.equal(signals.reviewTaskCount, 2);
  assert.equal(signals.blockingReviewTaskCount, 1);
  assert.match(signals.reviewTaskSummary, /阻断:确认客户标签留痕规则/);
  assert.match(signals.reviewTaskSummary, /待处理:确认客户标签术语/);
  assert.equal(signals.evidenceSummary, "snapshot:snapshot-1-2；iteration:2");
  assert(signals.alerts.some((item) => item.includes("阻断型建模待确认任务")));
  assert(signals.alerts.some((item) => item.includes("尚未形成正式模型快照")));
});
