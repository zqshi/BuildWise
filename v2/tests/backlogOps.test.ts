import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SqliteWorkspaceBacklog } from "../backend/src/infrastructure/persistence/sqliteWorkspaceBacklog.ts";
import { backlogAndKnowledge } from "../backend/src/infrastructure/persistence/migrations/004_backlog_and_knowledge.ts";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  backlogAndKnowledge.up(db);
  return db;
}

describe("需求池 CRUD", () => {
  let db: DatabaseSync;
  let store: SqliteWorkspaceBacklog;

  beforeEach(() => {
    db = createTestDb();
    store = new SqliteWorkspaceBacklog(db);
  });

  test("创建需求条目并查询", () => {
    const item = store.createBacklogItem(1, { title: "支持批量导入客户数据" }, "user-1");
    assert.equal(item.title, "支持批量导入客户数据");
    assert.equal(item.projectId, 1);
    assert.equal(item.status, "open");
    assert.equal(item.priority, "medium");
    assert.equal(item.source, "internal");
    assert.equal(item.iterationId, null);
    assert.equal(item.createdBy, "user-1");
    assert.ok(item.createdAt);
  });

  test("创建时指定迭代则状态为 planned", () => {
    const item = store.createBacklogItem(1, { title: "需求A", iterationId: 5 }, "user-1");
    assert.equal(item.iterationId, 5);
    assert.equal(item.status, "planned");
  });

  test("列表按项目筛选", () => {
    store.createBacklogItem(1, { title: "需求A" }, "u1");
    store.createBacklogItem(1, { title: "需求B" }, "u1");
    store.createBacklogItem(2, { title: "需求C" }, "u1");
    const items = store.listBacklogItems(1);
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.projectId === 1));
  });

  test("按迭代查询", () => {
    store.createBacklogItem(1, { title: "A", iterationId: 10 }, "u1");
    store.createBacklogItem(1, { title: "B", iterationId: 20 }, "u1");
    store.createBacklogItem(1, { title: "C" }, "u1");
    const items = store.listBacklogItemsByIteration(10);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "A");
  });

  test("更新需求条目", () => {
    const item = store.createBacklogItem(1, { title: "原始标题" }, "u1");
    store.updateBacklogItem({ ...item, title: "新标题", priority: "high", status: "in-progress" });
    const updated = store.findBacklogItem(item.id)!;
    assert.equal(updated.title, "新标题");
    assert.equal(updated.priority, "high");
    assert.equal(updated.status, "in-progress");
  });

  test("删除需求条目", () => {
    const item = store.createBacklogItem(1, { title: "待删除" }, "u1");
    assert.equal(store.deleteBacklogItem(item.id), true);
    assert.equal(store.findBacklogItem(item.id), null);
  });

  test("删除不存在的条目返回 false", () => {
    assert.equal(store.deleteBacklogItem(9999), false);
  });

  test("tags JSON 序列化", () => {
    const item = store.createBacklogItem(1, { title: "T", tags: ["客户A", "紧急"] }, "u1");
    const found = store.findBacklogItem(item.id)!;
    assert.deepEqual(found.tags, ["客户A", "紧急"]);
  });

  test("完整字段创建", () => {
    const item = store.createBacklogItem(1, {
      title: "完整需求",
      description: "详细描述",
      priority: "critical",
      source: "customer",
      sourceRef: "客户张三",
      tags: ["标签1"],
      iterationId: 3
    }, "pm-user");
    assert.equal(item.description, "详细描述");
    assert.equal(item.priority, "critical");
    assert.equal(item.source, "customer");
    assert.equal(item.sourceRef, "客户张三");
    assert.deepEqual(item.tags, ["标签1"]);
    assert.equal(item.iterationId, 3);
  });
});
