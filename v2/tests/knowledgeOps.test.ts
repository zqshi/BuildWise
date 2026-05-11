import assert from "node:assert/strict";
import { test, describe, beforeEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SqliteWorkspaceKnowledge } from "../backend/src/infrastructure/persistence/sqliteWorkspaceKnowledge.ts";
import { backlogAndKnowledge } from "../backend/src/infrastructure/persistence/migrations/004_backlog_and_knowledge.ts";
import { knowledgeGroup } from "../backend/src/infrastructure/persistence/migrations/005_knowledge_group.ts";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  backlogAndKnowledge.up(db);
  knowledgeGroup.up(db);
  return db;
}

describe("知识库 CRUD", () => {
  let db: DatabaseSync;
  let store: SqliteWorkspaceKnowledge;

  beforeEach(() => {
    db = createTestDb();
    store = new SqliteWorkspaceKnowledge(db);
  });

  test("创建知识条目", () => {
    const entry = store.createKnowledgeEntry(1, {
      title: "数据库连接池配置经验",
      content: "生产环境建议最大连接数设为 CPU 核数 * 2 + 1",
      category: "technical"
    }, "dev-1");
    assert.equal(entry.title, "数据库连接池配置经验");
    assert.equal(entry.category, "technical");
    assert.equal(entry.status, "draft");
    assert.equal(entry.createdBy, "dev-1");
    assert.equal(entry.projectId, 1);
    assert.ok(entry.createdAt);
  });

  test("列表按项目筛选", () => {
    store.createKnowledgeEntry(1, { title: "A", content: "c", category: "technical" }, "u1");
    store.createKnowledgeEntry(1, { title: "B", content: "c", category: "pitfall" }, "u1");
    store.createKnowledgeEntry(2, { title: "C", content: "c", category: "technical" }, "u1");
    const items = store.listKnowledgeEntries(1);
    assert.equal(items.length, 2);
  });

  test("更新知识条目", () => {
    const entry = store.createKnowledgeEntry(1, { title: "初始", content: "初始内容", category: "technical" }, "u1");
    store.updateKnowledgeEntry({ ...entry, title: "更新后", status: "published", reviewedBy: "reviewer-1" });
    const updated = store.findKnowledgeEntry(entry.id)!;
    assert.equal(updated.title, "更新后");
    assert.equal(updated.status, "published");
    assert.equal(updated.reviewedBy, "reviewer-1");
  });

  test("删除知识条目", () => {
    const entry = store.createKnowledgeEntry(1, { title: "D", content: "c", category: "pitfall" }, "u1");
    assert.equal(store.deleteKnowledgeEntry(entry.id), true);
    assert.equal(store.findKnowledgeEntry(entry.id), null);
  });

  test("删除不存在的条目返回 false", () => {
    assert.equal(store.deleteKnowledgeEntry(9999), false);
  });

  test("文本搜索 - 标题匹配", () => {
    store.createKnowledgeEntry(1, { title: "连接池配置", content: "内容1", category: "technical" }, "u1");
    store.createKnowledgeEntry(1, { title: "接口设计", content: "内容2", category: "technical" }, "u1");
    store.createKnowledgeEntry(1, { title: "缓存策略", content: "内容3", category: "technical" }, "u1");
    const results = store.searchKnowledgeEntries(1, "连接池");
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "连接池配置");
  });

  test("文本搜索 - 内容匹配", () => {
    store.createKnowledgeEntry(1, { title: "T1", content: "数据库连接超时应设为30秒", category: "technical" }, "u1");
    store.createKnowledgeEntry(1, { title: "T2", content: "缓存TTL建议5分钟", category: "technical" }, "u1");
    const results = store.searchKnowledgeEntries(1, "超时");
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "T1");
  });

  test("文本搜索 - 适用场景匹配", () => {
    store.createKnowledgeEntry(1, { title: "T", content: "c", category: "technical", applicableScene: "高并发场景下的限流配置" }, "u1");
    const results = store.searchKnowledgeEntries(1, "限流");
    assert.equal(results.length, 1);
  });

  test("文本搜索 - limit 限制", () => {
    for (let i = 0; i < 15; i++) {
      store.createKnowledgeEntry(1, { title: `重复标题${i}`, content: "重复内容", category: "technical" }, "u1");
    }
    const results = store.searchKnowledgeEntries(1, "重复", 5);
    assert.equal(results.length, 5);
  });

  test("tags JSON 序列化", () => {
    const entry = store.createKnowledgeEntry(1, { title: "T", content: "c", category: "pitfall", tags: ["性能", "数据库"] }, "u1");
    const found = store.findKnowledgeEntry(entry.id)!;
    assert.deepEqual(found.tags, ["性能", "数据库"]);
  });

  test("完整字段创建", () => {
    const entry = store.createKnowledgeEntry(1, {
      title: "客户特殊需求处理",
      content: "# 方案\n详细内容",
      category: "customer-experience",
      applicableScene: "当客户要求定制化报表时",
      tags: ["客户A", "报表"],
      source: "coach",
      sourceRef: "iteration-5-coach-session",
      iterationId: 5
    }, "pm-1");
    assert.equal(entry.category, "customer-experience");
    assert.equal(entry.applicableScene, "当客户要求定制化报表时");
    assert.equal(entry.source, "coach");
    assert.equal(entry.sourceRef, "iteration-5-coach-session");
    assert.equal(entry.iterationId, 5);
  });

  test("跨项目隔离", () => {
    store.createKnowledgeEntry(1, { title: "项目1经验", content: "c", category: "technical" }, "u1");
    store.createKnowledgeEntry(2, { title: "项目2经验", content: "c", category: "technical" }, "u1");
    const results = store.searchKnowledgeEntries(1, "经验");
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "项目1经验");
  });
});
