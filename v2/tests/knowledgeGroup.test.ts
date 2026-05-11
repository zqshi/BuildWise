import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { SqliteWorkspaceKnowledge } from "../backend/src/infrastructure/persistence/sqliteWorkspaceKnowledge.ts";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE knowledge_entries (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      iteration_id INTEGER,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'technical',
      group_name TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      applicable_scene TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("知识库 groupName 字段", () => {
  let store: SqliteWorkspaceKnowledge;

  beforeEach(() => {
    store = new SqliteWorkspaceKnowledge(createTestDb());
  });

  it("创建时指定 groupName", () => {
    const entry = store.createKnowledgeEntry(1, { title: "Redis配置", content: "内容", category: "technical", groupName: "后端" }, "user1");
    assert.equal(entry.groupName, "后端");
  });

  it("创建时不指定 groupName 默认空字符串", () => {
    const entry = store.createKnowledgeEntry(1, { title: "React hooks", content: "内容", category: "technical" }, "user1");
    assert.equal(entry.groupName, "");
  });

  it("更新 groupName", () => {
    const entry = store.createKnowledgeEntry(1, { title: "测试条目", content: "x", category: "pitfall" }, "user1");
    store.updateKnowledgeEntry({ ...entry, groupName: "数据库" });
    const updated = store.findKnowledgeEntry(entry.id);
    assert.equal(updated!.groupName, "数据库");
  });
});
