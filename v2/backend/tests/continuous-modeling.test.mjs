import test from "node:test";
import assert from "node:assert/strict";
const { ContinuousModelingService } = await import("../dist/application/continuousModeling/continuousModelingService.js");

test("ContinuousModelingService builds candidate snapshot from baseline and flags new terms", () => {
  const saved = [];
  const repository = {
    getLatestPublishedSnapshot(projectId) {
      assert.equal(projectId, 9);
      return {
        id: "snapshot-9-1-published",
        projectId: 9,
        iterationId: 1,
        version: "9.1.published",
        status: "published",
        ontologyTerms: [
          {
            canonicalTerm: "线索",
            aliases: ["销售线索"],
            technicalAliases: ["lead"],
            definition: "销售机会入口。",
            evidence: ["baseline"]
          }
        ],
        entities: [
          {
            id: "entity_lead",
            name: "Lead",
            businessName: "线索",
            fields: [{ name: "name", type: "string", required: true }]
          }
        ],
        relations: [],
        rules: [
          {
            id: "rule-lead-owner",
            name: "线索必须归属负责人",
            statement: "线索必须归属负责人",
            linkedEntityIds: ["entity_lead"],
            linkedSurfaceIds: [],
            linkedApiIds: []
          }
        ],
        reviewTasks: [],
        derivedFromSnapshotId: null,
        createdAt: "2026-03-17T00:00:00.000Z"
      };
    },
    saveCandidateSnapshot(snapshot) {
      saved.push(snapshot);
    }
  };
  const service = new ContinuousModelingService(repository);

  const plan = service.planIterationModeling({
    projectId: 9,
    iterationId: 2,
    baselineSnapshot: null,
    businessInputs: ["新增跟进记录并要求留痕"],
    ontologyTerms: [
      {
        canonicalTerm: "跟进记录",
        aliases: ["跟进", "跟进日志"],
        technicalAliases: ["followup"],
        definition: "销售跟进行为留痕。",
        evidence: ["prd-v2"]
      }
    ],
    entities: [
      {
        id: "entity_followup",
        name: "Followup",
        businessName: "跟进记录",
        fields: [{ name: "content", type: "string", required: true }]
      }
    ],
    relations: [],
    rules: [
      {
        id: "rule-followup-audit",
        name: "跟进记录必须留痕",
        statement: "跟进记录必须留痕",
        linkedEntityIds: ["entity_followup"],
        linkedSurfaceIds: ["followup-drawer"],
        linkedApiIds: ["POST /api/followups"]
      }
    ]
  });

  assert.equal(plan.changedTerms.length, 1);
  assert.equal(plan.changedTerms[0], "跟进记录");
  assert.equal(plan.changedEntities[0], "Followup");
  assert.equal(plan.changedRules[0], "跟进记录必须留痕");
  assert.equal(plan.blockingReviewTasks.length, 1);
  assert.equal(plan.candidateSnapshot.derivedFromSnapshotId, "snapshot-9-1-published");

  const persisted = service.saveCandidate(plan);
  assert.equal(persisted.ok, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, "candidate");
});

test("ContinuousModelingService creates blocking rule review when no rules are present", () => {
  const service = new ContinuousModelingService({
    getLatestPublishedSnapshot() {
      return null;
    },
    saveCandidateSnapshot() {}
  });

  const plan = service.planIterationModeling({
    projectId: 3,
    iterationId: 1,
    baselineSnapshot: null,
    businessInputs: ["只给出术语，暂未沉淀规则"],
    ontologyTerms: [
      {
        canonicalTerm: "客户画像",
        aliases: [],
        technicalAliases: ["customer-profile"],
        definition: "客户特征画像。",
        evidence: ["discovery-note"]
      }
    ],
    entities: [],
    relations: [],
    rules: []
  });

  assert.equal(plan.blockingReviewTasks.length, 2);
  assert.ok(plan.blockingReviewTasks.some((item) => item.type === "rule_confirmation"));
});
