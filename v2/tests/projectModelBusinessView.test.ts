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
