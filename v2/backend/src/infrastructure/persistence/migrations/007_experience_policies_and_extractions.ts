import type { Migration } from "./migrationRunner";

export const experiencePoliciesAndExtractions: Migration = {
  version: 7,
  name: "experience_policies_and_extractions",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS experience_policies (
        id INTEGER PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'platform',
        project_id INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        rules TEXT NOT NULL DEFAULT '[]',
        schedule_scan_enabled INTEGER NOT NULL DEFAULT 1,
        schedule_scan_interval_days INTEGER NOT NULL DEFAULT 7,
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_experience_policies_project ON experience_policies(project_id);
      CREATE INDEX IF NOT EXISTS idx_experience_policies_status ON experience_policies(status);

      CREATE TABLE IF NOT EXISTS experience_extractions (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        iteration_id INTEGER,
        trigger_event TEXT NOT NULL,
        source_stage TEXT NOT NULL DEFAULT '',
        source_digest TEXT NOT NULL DEFAULT '',
        extracted_entry_ids TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_experience_extractions_project ON experience_extractions(project_id);
      CREATE INDEX IF NOT EXISTS idx_experience_extractions_iteration ON experience_extractions(iteration_id);

      ALTER TABLE knowledge_entries ADD COLUMN experience_scope TEXT NOT NULL DEFAULT '';
      ALTER TABLE knowledge_entries ADD COLUMN confidence INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE knowledge_entries ADD COLUMN extraction_ref INTEGER;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS experience_extractions;
      DROP TABLE IF EXISTS experience_policies;
    `);
  }
};
