import type { Migration } from "./migrationRunner";

export const knowledgeGraph: Migration = {
  version: 6,
  name: "knowledge_graph",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_graph_cache (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL UNIQUE,
        graph_data TEXT NOT NULL,
        entry_count INTEGER NOT NULL DEFAULT 0,
        generated_at TEXT NOT NULL
      );
    `);
  },
  down(db) {
    db.exec("DROP TABLE IF EXISTS knowledge_graph_cache;");
  }
};
