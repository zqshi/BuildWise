import assert from "node:assert/strict";
import test from "node:test";
import { buildModelRelationGraph } from "../src/pages/projects/projectModelGraphModel.ts";

test("buildModelRelationGraph creates graph nodes and edges from relations", () => {
  const graph = buildModelRelationGraph(
    [
      { id: "r-1", fromEntityId: "entity_project", toEntityId: "entity_iteration", type: "one_to_many" },
      { id: "r-2", fromEntityId: "entity_project", toEntityId: "entity_task", type: "one_to_many" }
    ],
    3
  );

  assert.equal(graph.nodes.length, 3);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.maxDegree, 2);
  assert.equal(graph.unlinkedEntityCount, 0);
  assert.equal(graph.nodes[0]?.id, "entity_project");
});

test("buildModelRelationGraph reports unlinked entities and truncation", () => {
  const relations = Array.from({ length: 5 }).map((_, index) => ({
    id: `r-${index}`,
    fromEntityId: `entity_core_${index}`,
    toEntityId: `entity_leaf_${index}`,
    type: "one_to_many" as const
  }));

  const graph = buildModelRelationGraph(relations, 20, 6);

  assert.equal(graph.truncated, true);
  assert.equal(graph.hiddenNodeCount, 4);
  assert.equal(graph.nodes.length, 6);
  assert.equal(graph.unlinkedEntityCount, 10);
  assert.ok(graph.edges.length <= relations.length);
});

