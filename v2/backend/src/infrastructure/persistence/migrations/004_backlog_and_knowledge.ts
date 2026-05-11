import type { Migration } from "./migrationRunner";

export const backlogAndKnowledge: Migration = {
  version: 4,
  name: "backlog_and_knowledge",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS backlog_items (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        iteration_id INTEGER,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        source TEXT NOT NULL DEFAULT 'internal',
        source_ref TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_backlog_items_project ON backlog_items(project_id);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_iteration ON backlog_items(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_status ON backlog_items(status);
      CREATE INDEX IF NOT EXISTS idx_backlog_items_priority ON backlog_items(priority);

      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        iteration_id INTEGER,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'technical',
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
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_project ON knowledge_entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_category ON knowledge_entries(category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_status ON knowledge_entries(status);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS knowledge_entries;
      DROP TABLE IF EXISTS backlog_items;
    `);
  }
};
