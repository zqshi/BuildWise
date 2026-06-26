import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { BacklogItem } from "../src/domain/workspace/backlogTypes.ts";
import { groupBacklogByIteration } from "../src/domain/workspace/backlogGrouping.ts";
import type { BacklogIterationSummary } from "../src/domain/workspace/backlogGrouping.ts";

function makeItem(id: number, iterationId: number | null, title = `需求${id}`): BacklogItem {
  return {
    id,
    projectId: 1,
    iterationId,
    title,
    description: "",
    priority: "medium",
    status: "open",
    source: "internal",
    sourceRef: "",
    tags: [],
    createdBy: "tester",
    createdAt: "2026-06-26T00:00:00Z",
    updatedAt: "2026-06-26T00:00:00Z",
  };
}

const ITERATIONS: BacklogIterationSummary[] = [
  { id: 1, version: "v1", name: "迭代一" },
  { id: 2, version: "v2", name: "迭代二" },
];

describe("需求按版本分组", () => {
  test("未归属需求归入未分配组，不产生版本组", () => {
    const { unassigned, groups } = groupBacklogByIteration([makeItem(1, null)], ITERATIONS);
    assert.equal(unassigned.length, 1);
    assert.equal(unassigned[0].id, 1);
    assert.equal(groups.length, 0);
  });

  test("归属需求进入对应版本组", () => {
    const { unassigned, groups } = groupBacklogByIteration(
      [makeItem(1, 1), makeItem(2, 2)],
      ITERATIONS
    );
    assert.equal(unassigned.length, 0);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].iteration.id, 1);
    assert.equal(groups[0].items[0].id, 1);
    assert.equal(groups[1].iteration.id, 2);
    assert.equal(groups[1].items[0].id, 2);
  });

  test("同版本需求聚合，跨版本不串", () => {
    const { groups } = groupBacklogByIteration(
      [makeItem(1, 1), makeItem(2, 1), makeItem(3, 2)],
      ITERATIONS
    );
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 1);
  });

  test("版本组顺序与入参 iterations 一致（即使只有 v2 有需求）", () => {
    const { groups } = groupBacklogByIteration([makeItem(1, 2)], ITERATIONS);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].iteration.id, 2);
  });

  test("归属到已删除 iteration 的需求回落未分配，避免丢失", () => {
    const { unassigned, groups } = groupBacklogByIteration([makeItem(1, 999)], ITERATIONS);
    assert.equal(unassigned.length, 1);
    assert.equal(unassigned[0].id, 1);
    assert.equal(groups.length, 0);
  });

  test("无需求的版本组不返回，避免空区", () => {
    const { groups } = groupBacklogByIteration([makeItem(1, 1)], ITERATIONS);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].iteration.id, 1);
  });

  test("空列表与空版本均返回空结构", () => {
    const result = groupBacklogByIteration([], ITERATIONS);
    assert.equal(result.unassigned.length, 0);
    assert.equal(result.groups.length, 0);
  });
});
