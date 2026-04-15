import type { DatabaseSync } from "node:sqlite";
import type {
  AttachmentAnalysisJob,
  AttachmentReportIndex,
  AttachmentReportSection,
  AttachmentUploadRecord,
  AttachmentIngestJob
} from "../../domain/workspace/analysisTypes";

function parseJson<T>(text: string | undefined | null): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

function rowToAnalysisJob(row: Record<string, unknown>): AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string } {
  return {
    jobId: String(row.job_id ?? ""),
    iterationId: Number(row.iteration_id ?? 0),
    status: String(row.status ?? "queued") as AttachmentAnalysisJob["status"],
    createdAt: String(row.created_at ?? ""),
    startedAt: String(row.started_at ?? ""),
    finishedAt: String(row.finished_at ?? ""),
    inputSummary: parseJson(String(row.input_summary ?? "{}")) ?? { fileName: "", sourceType: "single-file" as const, folderName: "", totalFiles: 0, totalBytes: 0 },
    progress: parseJson(String(row.progress ?? "{}")) ?? { totalFiles: 0, processedFiles: 0, totalBatches: 0, completedBatches: 0, failedBatches: 0, retriedBatches: 0 },
    warnings: parseJson<string[]>(String(row.warnings ?? "[]")) ?? [],
    error: String(row.error ?? ""),
    result: row.result ? parseJson(String(row.result)) : null,
    input: parseJson(String(row.input ?? "{}")),
    inputFingerprint: String(row.input_fingerprint ?? "")
  };
}

function rowToReportIndex(row: Record<string, unknown>): AttachmentReportIndex {
  return {
    reportId: String(row.report_id ?? ""),
    analysisJobId: String(row.analysis_job_id ?? ""),
    iterationId: Number(row.iteration_id ?? 0),
    schemaVersion: String(row.schema_version ?? "v1"),
    status: String(row.status ?? "completed") as AttachmentReportIndex["status"],
    analyzedAt: String(row.analyzed_at ?? ""),
    summary: parseJson(String(row.summary ?? "{}")) ?? {},
    sections: parseJson<AttachmentReportIndex["sections"]>(String(row.sections ?? "[]")) ?? []
  };
}

export class SqliteWorkspaceAnalysisStore {
  constructor(private readonly db: DatabaseSync) {}

  saveAnalysisJob(job: AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }) {
    this.db.prepare(`
      INSERT INTO analysis_jobs (job_id, iteration_id, status, created_at, started_at, finished_at, input_summary, progress, warnings, error, result, input, input_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        status = excluded.status, started_at = excluded.started_at, finished_at = excluded.finished_at,
        input_summary = excluded.input_summary, progress = excluded.progress, warnings = excluded.warnings,
        error = excluded.error, result = excluded.result
    `).run(
      job.jobId, job.iterationId, job.status, job.createdAt, job.startedAt, job.finishedAt,
      JSON.stringify(job.inputSummary), JSON.stringify(job.progress), JSON.stringify(job.warnings),
      job.error, job.result ? JSON.stringify(job.result) : null,
      job.input ? JSON.stringify(job.input) : "{}", job.inputFingerprint ?? ""
    );
  }

  findAnalysisJob(jobId: string): (AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }) | null {
    const row = this.db.prepare("SELECT * FROM analysis_jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | undefined;
    return row ? rowToAnalysisJob(row) : null;
  }

  listAnalysisJobs(iterationId: number): Array<AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }> {
    const rows = this.db.prepare("SELECT * FROM analysis_jobs WHERE iteration_id = ? ORDER BY created_at ASC").all(iterationId) as Record<string, unknown>[];
    return rows.map((row) => rowToAnalysisJob(row));
  }

  saveReportIndex(report: AttachmentReportIndex) {
    this.db.prepare(`
      INSERT INTO report_indexes (report_id, analysis_job_id, iteration_id, schema_version, status, analyzed_at, summary, sections)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET
        status = excluded.status, summary = excluded.summary, sections = excluded.sections
    `).run(
      report.reportId, report.analysisJobId, report.iterationId, report.schemaVersion,
      report.status, report.analyzedAt, JSON.stringify(report.summary), JSON.stringify(report.sections)
    );
  }

  findReportIndex(reportId: string): AttachmentReportIndex | null {
    const row = this.db.prepare("SELECT * FROM report_indexes WHERE report_id = ?").get(reportId) as Record<string, unknown> | undefined;
    return row ? rowToReportIndex(row) : null;
  }

  findReportIndexByJob(jobId: string): AttachmentReportIndex | null {
    const row = this.db.prepare("SELECT * FROM report_indexes WHERE analysis_job_id = ?").get(jobId) as Record<string, unknown> | undefined;
    return row ? rowToReportIndex(row) : null;
  }

  saveReportSections(sections: AttachmentReportSection[]) {
    const stmt = this.db.prepare(`
      INSERT INTO report_sections (section_id, report_id, section_key, section_order, status, item_count, updated_at, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(section_id) DO UPDATE SET
        status = excluded.status, item_count = excluded.item_count, updated_at = excluded.updated_at, content = excluded.content
    `);
    for (const s of sections) {
      stmt.run(s.sectionId, s.reportId, s.sectionKey, s.sectionOrder, s.status, s.itemCount, s.updatedAt, JSON.stringify(s.content));
    }
  }

  listReportSections(reportId: string): AttachmentReportSection[] {
    const rows = this.db.prepare("SELECT * FROM report_sections WHERE report_id = ? ORDER BY section_order ASC").all(reportId) as Record<string, unknown>[];
    return rows.map((row) => ({
      sectionId: String(row.section_id ?? ""),
      reportId: String(row.report_id ?? ""),
      sectionKey: String(row.section_key ?? "overview") as AttachmentReportSection["sectionKey"],
      sectionOrder: Number(row.section_order ?? 0),
      status: String(row.status ?? "ready") as AttachmentReportSection["status"],
      itemCount: Number(row.item_count ?? 0),
      updatedAt: String(row.updated_at ?? ""),
      content: parseJson(String(row.content ?? "{}")) ?? {}
    }));
  }

  saveUpload(upload: AttachmentUploadRecord) {
    this.db.prepare(`
      INSERT INTO attachment_uploads (upload_id, iteration_id, source_type, folder_name, idempotency_key, status, total_files, total_bytes, files, created_at, updated_at, error_code, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(upload_id) DO UPDATE SET
        status = excluded.status, total_files = excluded.total_files, total_bytes = excluded.total_bytes,
        files = excluded.files, updated_at = excluded.updated_at, error_code = excluded.error_code, error_message = excluded.error_message
    `).run(
      upload.uploadId, upload.iterationId, upload.sourceType, upload.folderName, upload.idempotencyKey,
      upload.status, upload.totalFiles, upload.totalBytes, JSON.stringify(upload.files),
      upload.createdAt, upload.updatedAt, upload.errorCode, upload.errorMessage
    );
  }

  findUpload(uploadId: string): AttachmentUploadRecord | null {
    const row = this.db.prepare("SELECT * FROM attachment_uploads WHERE upload_id = ?").get(uploadId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      uploadId: String(row.upload_id ?? ""),
      iterationId: Number(row.iteration_id ?? 0),
      sourceType: String(row.source_type ?? "single-file") as AttachmentUploadRecord["sourceType"],
      folderName: String(row.folder_name ?? ""),
      idempotencyKey: String(row.idempotency_key ?? ""),
      status: String(row.status ?? "uploading") as AttachmentUploadRecord["status"],
      totalFiles: Number(row.total_files ?? 0),
      totalBytes: Number(row.total_bytes ?? 0),
      files: parseJson<AttachmentUploadRecord["files"]>(String(row.files ?? "[]")) ?? [],
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      errorCode: String(row.error_code ?? ""),
      errorMessage: String(row.error_message ?? "")
    };
  }

  listUploads(iterationId: number): AttachmentUploadRecord[] {
    const rows = this.db.prepare("SELECT * FROM attachment_uploads WHERE iteration_id = ? ORDER BY created_at ASC").all(iterationId) as Record<string, unknown>[];
    return rows.map((row) => this.findUpload(String(row.upload_id))!).filter(Boolean);
  }

  saveIngestJob(job: AttachmentIngestJob) {
    this.db.prepare(`
      INSERT INTO attachment_ingest_jobs (ingest_job_id, upload_id, status, total_files, processed_files, created_at, started_at, finished_at, heartbeat_at, error_code, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ingest_job_id) DO UPDATE SET
        status = excluded.status, processed_files = excluded.processed_files,
        started_at = excluded.started_at, finished_at = excluded.finished_at, heartbeat_at = excluded.heartbeat_at,
        error_code = excluded.error_code, error_message = excluded.error_message
    `).run(
      job.ingestJobId, job.uploadId, job.status, job.totalFiles, job.processedFiles,
      job.createdAt, job.startedAt, job.finishedAt, job.heartbeatAt, job.errorCode, job.errorMessage
    );
  }

  findIngestJob(ingestJobId: string): AttachmentIngestJob | null {
    const row = this.db.prepare("SELECT * FROM attachment_ingest_jobs WHERE ingest_job_id = ?").get(ingestJobId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ingestJobId: String(row.ingest_job_id ?? ""),
      uploadId: String(row.upload_id ?? ""),
      status: String(row.status ?? "queued") as AttachmentIngestJob["status"],
      totalFiles: Number(row.total_files ?? 0),
      processedFiles: Number(row.processed_files ?? 0),
      createdAt: String(row.created_at ?? ""),
      startedAt: String(row.started_at ?? ""),
      finishedAt: String(row.finished_at ?? ""),
      heartbeatAt: String(row.heartbeat_at ?? ""),
      errorCode: String(row.error_code ?? ""),
      errorMessage: String(row.error_message ?? "")
    };
  }
}
