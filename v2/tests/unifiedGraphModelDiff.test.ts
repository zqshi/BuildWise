import assert from "node:assert/strict";
import test from "node:test";
import { mergeToUnifiedGraph } from "../src/pages/projects/unifiedGraphModel.ts";

function modelView(entities) {
  return { entities: entities ?? [], relations: [] };
}

test("mergeToUnifiedGraph 不传 previousNodeIds → 所有节点 isNew 为 undefined", () => {
  const result = mergeToUnifiedGraph(modelView([{ id: "e1", name: "订单", businessName: "订单" }]), null, null);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].isNew, undefined);
});

test("mergeToUnifiedGraph 传 previousNodeIds → 上一版本没有的节点 isNew=true", () => {
  const result = mergeToUnifiedGraph(
    modelView([
      { id: "e1", name: "订单", businessName: "订单" },
      { id: "e2", name: "退款", businessName: "退款" },
    ]),
    null,
    null,
    new Set(["m-e1"])
  );
  assert.equal(result.nodes.length, 2);
  const order = result.nodes.find((n) => n.id === "m-e1");
  const refund = result.nodes.find((n) => n.id === "m-e2");
  assert.equal(order.isNew, false, "e1 在上一版本存在 → isNew=false");
  assert.equal(refund.isNew, true, "e2 不在上一版本 → isNew=true");
});

test("mergeToUnifiedGraph 传空 previousNodeIds → 所有节点 isNew=true（全部新增）", () => {
  const result = mergeToUnifiedGraph(
    modelView([{ id: "e1", name: "订单", businessName: "订单" }]),
    null,
    null,
    new Set()
  );
  assert.equal(result.nodes[0].isNew, true);
});

test("mergeToUnifiedGraph 知识节点也参与 isNew 标记", () => {
  const knowledgeGraph = {
    nodes: [{ id: "k1", label: "退款规则", type: "rule", entryIds: [1] }],
    edges: [],
    summary: "", insights: [],
  };
  const result = mergeToUnifiedGraph(null, knowledgeGraph, null, new Set());
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].isNew, true);
});
