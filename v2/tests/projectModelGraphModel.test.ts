import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("project overview includes model detail view toggle for graph mode", () => {
  const viewPath = new URL("../src/pages/projects/ProjectOverviewPanel.tsx", import.meta.url);
  const detailPath = new URL("../src/pages/projects/ProjectOverviewPanelModelDetails.tsx", import.meta.url);
  const source = `${readFileSync(viewPath, "utf8")}\n${readFileSync(detailPath, "utf8")}`;

  assert.match(source, /建模详情视图切换/);
  assert.match(source, /结构化摘要/);
  assert.match(source, /节点关系图/);
  assert.match(source, /建模节点关系图/);
  assert.match(source, /关系类型筛选/);
  assert.match(source, /已高亮与「/);
  assert.match(source, /节点关系明细：/);
  assert.match(source, /出边关系/);
  assert.match(source, /入边关系/);
  assert.match(source, /定位并闪烁对应关系/);
  assert.match(source, /relation-detail-link/);
  assert.match(source, /is-flash/);
  assert.match(source, /model-relation-graph-viewport/);
  assert.match(source, /centerGraphOnPoint/);
  assert.match(source, /加载演示数据/);
  assert.match(source, /恢复真实数据/);
  assert.match(source, /演示数据（mock）/);
  assert.match(source, /建模依据：当前项目沉淀数据实体/);
  assert.match(source, /edge\.businessDescription/);
  assert.match(source, /本体依据：/);
  assert.match(source, /数据依据：/);
  assert.doesNotMatch(source, /buildRelationBusinessDescription/);
});
