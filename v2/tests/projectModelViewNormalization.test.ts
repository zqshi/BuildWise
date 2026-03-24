import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProjectModelViewPayload } from "../src/app/projectModelViewNormalization.ts";

test("normalizeProjectModelViewPayload fills missing arrays for legacy payloads", () => {
  const normalized = normalizeProjectModelViewPayload({
    entities: [{ id: "entity_customer", name: "CustomerProfile" }],
    rules: [{ id: "rule-1", name: "标签留痕" }],
    ontologyTerms: [{ businessTerm: "客户" }]
  });

  assert.deepEqual(normalized.entities[0]?.fields, []);
  assert.deepEqual(normalized.rules[0]?.linkedEntityIds, []);
  assert.deepEqual(normalized.rules[0]?.linkedSurfaceIds, []);
  assert.deepEqual(normalized.rules[0]?.linkedApiIds, []);
  assert.deepEqual(normalized.ontologyTerms[0]?.aliases, []);
  assert.deepEqual(normalized.ontologyTerms[0]?.technicalAliases, []);
  assert.equal(normalized.latestSnapshotStatus, "none");
  assert.equal(normalized.latestSnapshotId, null);
});
