import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModelEntityCards,
  buildModelRelationNarratives,
  buildModelRuleMappings
} from "../src/pages/projects/projectModelBusinessView.ts";

const sampleView = {
  projectId: 1,
  projectName: "统一建模项目",
  projectDescription: "desc",
  iterationId: 2,
  iterationName: "客户标签",
  iterationStatus: "in-progress",
  latestSnapshotId: "snapshot-1-2",
  latestSnapshotStatus: "candidate" as const,
  ontologyTerms: [
    {
      businessTerm: "客户",
      aliases: ["会员"],
      technicalAliases: ["customer_profile"],
      definition: "平台内可被识别和运营的用户对象。",
      source: "snapshot" as const
    }
  ],
  rules: [
    {
      id: "rule-1",
      name: "客户标签变更必须留痕",
      statement: "客户标签变更必须留痕",
      source: "snapshot" as const,
      linkedEntityIds: ["entity_customer"],
      linkedSurfaceIds: ["客户详情页"],
      linkedApiIds: ["POST /api/v1/customers/:id/tags"]
    }
  ],
  entities: [
    {
      id: "entity_customer",
      name: "CustomerProfile",
      businessName: "客户",
      fields: [
        { name: "customerId", type: "string", required: true },
        { name: "tagIds", type: "string[]", required: false }
      ]
    }
  ],
  relations: [
    {
      id: "rel-1",
      fromEntityId: "entity_customer",
      toEntityId: "entity_customer_tag",
      type: "one_to_many" as const,
      businessMeaning: "一个客户可以拥有多个标签"
    }
  ],
  reviewTasks: [],
  evidence: []
};

test("projectModelBusinessView builds business-friendly entity cards", () => {
  const cards = buildModelEntityCards(sampleView);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.title, "客户");
  assert.match(cards[0]?.definition || "", /运营的用户对象/);
  assert.deepEqual(cards[0]?.fieldPreview, ["customerId:string *", "tagIds:string[]"]);
  assert.equal(cards[0]?.relationCount, 1);
  assert.equal(cards[0]?.ruleCount, 1);
});

test("projectModelBusinessView builds rule mappings and relation narratives", () => {
  const mappings = buildModelRuleMappings(sampleView);
  const narratives = buildModelRelationNarratives(sampleView);

  assert.equal(mappings[0]?.linkedEntities[0], "客户");
  assert.equal(mappings[0]?.linkedSurfaces[0], "客户详情页");
  assert.equal(mappings[0]?.linkedApis[0], "POST /api/v1/customers/:id/tags");
  assert.match(narratives[0]?.title || "", /客户 一对多 entity customer tag|客户 一对多/);
  assert.match(narratives[0]?.meaning || "", /多个标签/);
});

test("projectModelBusinessView tolerates legacy sparse model payloads", () => {
  const sparseView = {
    projectId: 1,
    entities: [{ id: "entity_customer", name: "CustomerProfile", businessName: "客户" }],
    rules: [{ id: "rule-1", name: "标签留痕", source: "snapshot" as const }],
    relations: [{ id: "rel-1", fromEntityId: "entity_customer", toEntityId: "entity_tag", type: "one_to_many" as const }]
  } as const;

  const cards = buildModelEntityCards(sparseView as never);
  const mappings = buildModelRuleMappings(sparseView as never);
  const narratives = buildModelRelationNarratives(sparseView as never);

  assert.equal(cards[0]?.fieldPreview.length, 0);
  assert.equal(cards[0]?.ruleCount, 0);
  assert.deepEqual(mappings[0]?.linkedEntities, []);
  assert.deepEqual(mappings[0]?.linkedSurfaces, []);
  assert.deepEqual(mappings[0]?.linkedApis, []);
  assert.match(narratives[0]?.title || "", /客户 一对多/);
  assert.doesNotMatch(cards[0]?.definition || "", /暂无业务定义/);
});

test("projectModelBusinessView derives fallback definition from linked rules", () => {
  const ruleOnlyView = {
    projectId: 1,
    entities: [{ id: "entity_export_job", name: "ExportJob", businessName: "线索导出任务", fields: [] }],
    rules: [
      {
        id: "rule-1",
        name: "导出任务不得阻塞主链路",
        statement: "导出任务必须异步执行，不能阻塞线索录入和跟进记录保存。",
        source: "snapshot" as const,
        linkedEntityIds: ["entity_export_job"],
        linkedSurfaceIds: [],
        linkedApiIds: []
      }
    ],
    relations: [],
    ontologyTerms: [],
    reviewTasks: [],
    evidence: [],
    latestSnapshotId: null,
    latestSnapshotStatus: "none" as const
  };

  const cards = buildModelEntityCards(ruleOnlyView as never);
  assert.match(cards[0]?.definition || "", /异步执行/);
});

test("projectModelBusinessView derives fallback definition from relations when no rule exists", () => {
  const relationOnlyView = {
    projectId: 1,
    entities: [
      { id: "entity_lead", name: "Lead", businessName: "线索", fields: [] },
      { id: "entity_followup", name: "FollowupRecord", businessName: "跟进记录", fields: [] }
    ],
    rules: [],
    relations: [
      {
        id: "rel-1",
        fromEntityId: "entity_lead",
        toEntityId: "entity_followup",
        type: "one_to_many" as const,
        businessMeaning: "一条线索会沉淀多条跟进记录"
      }
    ],
    ontologyTerms: [],
    reviewTasks: [],
    evidence: [],
    latestSnapshotId: null,
    latestSnapshotStatus: "none" as const
  };

  const cards = buildModelEntityCards(relationOnlyView as never);
  assert.match(cards[0]?.definition || "", /跟进记录/);
});
