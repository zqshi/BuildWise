import type { Migration } from "./migrationRunner";

export const initialSchema: Migration = {
  version: 1,
  name: "initial_schema",
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        last_updated TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

      CREATE TABLE IF NOT EXISTS iterations (
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        current_flag INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_iterations_project_id ON iterations(project_id);
      CREATE INDEX IF NOT EXISTS idx_iterations_project_current ON iterations(project_id, current_flag);

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        iteration_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_iteration_id ON messages(iteration_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

      CREATE TABLE IF NOT EXISTS attachment_uploads (
        upload_id TEXT PRIMARY KEY,
        iteration_id INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        folder_name TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL,
        total_files INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_uploads_iter_idempotency ON attachment_uploads(iteration_id, idempotency_key);

      CREATE TABLE IF NOT EXISTS attachment_upload_files (
        file_id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        chunk_count INTEGER NOT NULL,
        uploaded_chunks INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(upload_id) REFERENCES attachment_uploads(upload_id)
      );
      CREATE INDEX IF NOT EXISTS idx_attachment_upload_files_upload ON attachment_upload_files(upload_id);

      CREATE TABLE IF NOT EXISTS attachment_file_chunks (
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_size_bytes INTEGER NOT NULL,
        chunk_sha256 TEXT NOT NULL,
        storage_uri TEXT NOT NULL,
        received_at TEXT NOT NULL,
        PRIMARY KEY(file_id, chunk_index),
        FOREIGN KEY(file_id) REFERENCES attachment_upload_files(file_id)
      );

      CREATE TABLE IF NOT EXISTS attachment_ingest_jobs (
        ingest_job_id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        status TEXT NOT NULL,
        total_files INTEGER NOT NULL,
        processed_files INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT '',
        finished_at TEXT NOT NULL DEFAULT '',
        heartbeat_at TEXT NOT NULL DEFAULT '',
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(upload_id) REFERENCES attachment_uploads(upload_id)
      );

      CREATE TABLE IF NOT EXISTS attachment_analysis_jobs (
        analysis_job_id TEXT PRIMARY KEY,
        iteration_id INTEGER NOT NULL,
        upload_id TEXT NOT NULL,
        ingest_job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        model_name TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        total_batches INTEGER NOT NULL DEFAULT 0,
        completed_batches INTEGER NOT NULL DEFAULT 0,
        failed_batches INTEGER NOT NULL DEFAULT 0,
        retried_batches INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT '',
        finished_at TEXT NOT NULL DEFAULT '',
        heartbeat_at TEXT NOT NULL DEFAULT '',
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_attachment_analysis_jobs_iteration ON attachment_analysis_jobs(iteration_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS attachment_analysis_batches (
        batch_id TEXT PRIMARY KEY,
        analysis_job_id TEXT NOT NULL,
        batch_order INTEGER NOT NULL,
        token_budget INTEGER NOT NULL,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT '',
        finished_at TEXT NOT NULL DEFAULT '',
        error_code TEXT NOT NULL DEFAULT '',
        error_message TEXT NOT NULL DEFAULT '',
        llm_raw_output TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_attachment_analysis_batches_job ON attachment_analysis_batches(analysis_job_id, batch_order);

      CREATE TABLE IF NOT EXISTS attachment_reports (
        report_id TEXT PRIMARY KEY,
        analysis_job_id TEXT NOT NULL,
        iteration_id INTEGER NOT NULL,
        schema_version TEXT NOT NULL,
        status TEXT NOT NULL,
        analyzed_at TEXT NOT NULL,
        summary_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attachment_report_sections (
        section_id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        section_key TEXT NOT NULL,
        section_order INTEGER NOT NULL,
        status TEXT NOT NULL,
        content_json TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_report_sections_unique ON attachment_report_sections(report_id, section_key);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS attachment_report_sections;
      DROP TABLE IF EXISTS attachment_reports;
      DROP TABLE IF EXISTS attachment_analysis_batches;
      DROP TABLE IF EXISTS attachment_analysis_jobs;
      DROP TABLE IF EXISTS attachment_ingest_jobs;
      DROP TABLE IF EXISTS attachment_file_chunks;
      DROP TABLE IF EXISTS attachment_upload_files;
      DROP TABLE IF EXISTS attachment_uploads;
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS iterations;
      DROP TABLE IF EXISTS projects;
    `);
  }
};
