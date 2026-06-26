import type { Migration } from "./migrationRunner";

export const knowledgeGroup: Migration = {
  version: 5,
  name: "knowledge_group",
  up(db) {
    db.exec(`ALTER TABLE knowledge_entries ADD COLUMN group_name TEXT NOT NULL DEFAULT '';`);
  },
  down(db) {
    db.exec("ALTER TABLE knowledge_entries DROP COLUMN group_name;");
  }
};
