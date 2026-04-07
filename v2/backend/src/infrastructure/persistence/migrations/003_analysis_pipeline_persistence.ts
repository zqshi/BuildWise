import type { Migration } from "./migrationRunner";

export const analysisPipelinePersistence: Migration = {
  version: 3,
  name: "analysis_pipeline_persistence",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_jobs (
        job_id TEXT PRIMARY KEY,
        iteration_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        created_at TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT '',
        finished_at TEXT NOT NULL DEFAULT '',
        input_summary TEXT NOT NULL DEFAULT '{}',
        progress TEXT NOT NULL DEFAULT '{}',
        warnings TEXT NOT NULL DEFAULT '[]',
        error TEXT NOT NULL DEFAULT '',
        result TEXT,
        input TEXT NOT NULL DEFAULT '{}',
        input_fingerprint TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_iteration ON analysis_jobs(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);

      CREATE TABLE IF NOT EXISTS report_indexes (
        report_id TEXT PRIMARY KEY,
        analysis_job_id TEXT NOT NULL,
        iteration_id INTEGER NOT NULL,
        schema_version TEXT NOT NULL DEFAULT 'v1',
        status TEXT NOT NULL DEFAULT 'completed',
        analyzed_at TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '{}',
        sections TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS idx_report_indexes_iteration ON report_indexes(iteration_id);
      CREATE INDEX IF NOT EXISTS idx_report_indexes_job ON report_indexes(analysis_job_id);

      CREATE TABLE IF NOT EXISTS report_sections (
        section_id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        section_key TEXT NOT NULL,
        section_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ready',
        item_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_report_sections_report ON report_sections(report_id);

      CREATE TABLE IF NOT EXISTS attachment_uploads (
        upload_id TEXT PRIMARY KEY,
        iteration_id INTEGER NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'single-file',
        folder_name TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'uploading',
        total_files INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        files TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_attachment_uploads_iteration ON attachment_uploads(iteration_id);

      CREATE TABLE IF NOT EXISTS attachment_ingest_jobs (
        ingest_job_id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        total_files INTEGER NOT NULL DEFAULT 0,
        processed_files INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT '',
        finished_at TEXT NOT NULL DEFAULT '',
        heartbeat_at TEXT NOT NULL DEFAULT '',
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_ingest_jobs_upload ON attachment_ingest_jobs(upload_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS attachment_ingest_jobs;
      DROP TABLE IF EXISTS attachment_uploads;
      DROP TABLE IF EXISTS report_sections;
      DROP TABLE IF EXISTS report_indexes;
      DROP TABLE IF EXISTS analysis_jobs;
    `);
  }
};
