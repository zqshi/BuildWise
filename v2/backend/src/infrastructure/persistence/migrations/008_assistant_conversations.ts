import type { Migration } from "./migrationRunner";

export const assistantConversations: Migration = {
  version: 8,
  name: "assistant_conversations",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assistant_messages (
        id INTEGER PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assistant_messages_tenant ON assistant_messages(tenant_id);
    `);
  },
  down(db) {
    db.exec("DROP TABLE IF EXISTS assistant_messages;");
  }
};
