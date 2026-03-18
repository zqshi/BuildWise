import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AuditLog,
  Iteration,
  IterationMessage,
  OpsTriageTemplateRecord,
  Project,
  WorkspaceStore
} from "../../domain/workspace/types";

export const seedStore: WorkspaceStore = {
  projects: [
    {
      id: 1,
      name: "构想智造平台",
      description: "统一项目模型驱动的迭代管理平台",
      status: "in-progress",
      icon: "cubes",
      iconColor: "blue",
      lastUpdated: new Date().toISOString().slice(0, 10)
    }
  ],
  iterations: [],
  messages: [],
  snapshots: [],
  transitions: [],
  auditLogs: [],
  versionSnapshots: [],
  projectShares: [],
  deployments: [],
  templateRuns: [],
  opsTriageTemplates: [],
  projectPolicies: [],
  projectWorkspaceBindings: [],
  policyExecutionLogs: [],
  projectRoleBindings: [],
  platformRoleBindings: [],
  governanceCustomRoles: []
};

export const collectionKeys: Array<keyof WorkspaceStore> = [
  "projects",
  "iterations",
  "messages",
  "snapshots",
  "transitions",
  "auditLogs",
  "versionSnapshots",
  "projectShares",
  "deployments",
  "templateRuns",
  "opsTriageTemplates",
  "projectPolicies",
  "projectWorkspaceBindings",
  "policyExecutionLogs",
  "projectRoleBindings",
  "platformRoleBindings",
  "governanceCustomRoles"
];

export function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeCollectionValue(value: unknown) {
  if (value === undefined) {
    return [];
  }
  return value;
}

export class SqliteWorkspaceCore {
  readonly db: DatabaseSync;

  private readonly seedDataFile?: string;

  constructor(dbFile: string, seedDataFile?: string) {
    this.seedDataFile = seedDataFile;
    const dir = dirname(dbFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbFile);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_collections (
        collection_name TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.initTypedTables();
  }

  nextIdFromTable(table: "projects" | "iterations" | "messages" | "audit_logs") {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${table}`)
      .get() as { next_id?: number } | undefined;
    return Number(row?.next_id || 1);
  }

  parsePayload<T>(payload: string | undefined): T | null {
    if (!payload) {
      return null;
    }
    try {
      return JSON.parse(payload) as T;
    } catch {
      return null;
    }
  }

  readCollection<T>(name: keyof WorkspaceStore): T[] {
    const row = this.db
      .prepare("SELECT payload FROM workspace_collections WHERE collection_name = ?")
      .get(name) as { payload?: string } | undefined;
    const parsed = this.parsePayload<unknown[]>(row?.payload);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }

  writeCollection(name: keyof WorkspaceStore, items: unknown[]) {
    this.db
      .prepare(
        `
        INSERT INTO workspace_collections (collection_name, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(collection_name) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `
      )
      .run(name, JSON.stringify(items), new Date().toISOString());
  }

  readStore(): WorkspaceStore {
    const hasDataRow = this.db
      .prepare("SELECT 1 AS ok FROM workspace_collections WHERE collection_name = ? LIMIT 1")
      .get("projects") as { ok?: number } | undefined;
    if (!hasDataRow?.ok) {
      if (this.seedDataFile && existsSync(this.seedDataFile)) {
        const raw = readFileSync(this.seedDataFile, "utf-8");
        const seeded = JSON.parse(raw) as WorkspaceStore;
        this.writeStore(seeded);
        return seeded;
      }
      this.writeStore(seedStore);
      return seedStore;
    }
    const parsed: Record<string, unknown> = {};
    const stmt = this.db.prepare("SELECT payload FROM workspace_collections WHERE collection_name = ?");
    for (const key of collectionKeys) {
      const row = stmt.get(key) as { payload?: string } | undefined;
      const payload = row?.payload;
      if (!payload) {
        parsed[key] = [];
        continue;
      }
      try {
        parsed[key] = JSON.parse(payload);
      } catch {
        parsed[key] = [];
      }
    }
    return {
      projects: toArray<Project>(parsed.projects),
      iterations: toArray<Iteration>(parsed.iterations),
      messages: toArray<IterationMessage>(parsed.messages),
      snapshots: toArray(parsed.snapshots),
      transitions: toArray(parsed.transitions),
      auditLogs: toArray<AuditLog>(parsed.auditLogs),
      versionSnapshots: toArray(parsed.versionSnapshots),
      projectShares: toArray(parsed.projectShares),
      deployments: toArray(parsed.deployments),
      templateRuns: toArray(parsed.templateRuns),
      opsTriageTemplates: toArray<OpsTriageTemplateRecord>(parsed.opsTriageTemplates),
      projectPolicies: toArray(parsed.projectPolicies),
      projectWorkspaceBindings: toArray(parsed.projectWorkspaceBindings),
      policyExecutionLogs: toArray(parsed.policyExecutionLogs),
      projectRoleBindings: toArray(parsed.projectRoleBindings),
      platformRoleBindings: toArray(parsed.platformRoleBindings),
      governanceCustomRoles: toArray(parsed.governanceCustomRoles)
    };
  }

  writeStore(data: WorkspaceStore) {
    const now = new Date().toISOString();
    const upsert = this.db.prepare(`
      INSERT INTO workspace_collections (collection_name, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(collection_name) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      for (const key of collectionKeys) {
        const normalized = normalizeCollectionValue((data as Record<string, unknown>)[key]);
        upsert.run(key, JSON.stringify(normalized), now);
      }
      this.syncTypedTables(data);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listProjects() {
    const rows = this.db
      .prepare("SELECT payload FROM projects ORDER BY id ASC")
      .all() as Array<{ payload?: string }>;
    return rows
      .map((row) => this.parsePayload<Project>(row.payload))
      .filter((item): item is Project => Boolean(item));
  }

  findProject(projectId: number) {
    const row = this.db
      .prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1")
      .get(projectId) as { payload?: string } | undefined;
    return this.parsePayload<Project>(row?.payload) ?? null;
  }

  listIterations(projectId: number) {
    const rows = this.db
      .prepare("SELECT payload FROM iterations WHERE project_id = ? ORDER BY id ASC")
      .all(projectId) as Array<{ payload?: string }>;
    return rows
      .map((row) => this.parsePayload<Iteration>(row.payload))
      .filter((item): item is Iteration => Boolean(item));
  }

  findIteration(iterationId: number) {
    const row = this.db
      .prepare("SELECT payload FROM iterations WHERE id = ? LIMIT 1")
      .get(iterationId) as { payload?: string } | undefined;
    return this.parsePayload<Iteration>(row?.payload) ?? null;
  }

  findPreviousIteration(iteration: Iteration) {
    const row = this.db
      .prepare("SELECT payload FROM iterations WHERE project_id = ? AND id < ? ORDER BY id DESC LIMIT 1")
      .get(iteration.projectId, iteration.id) as { payload?: string } | undefined;
    return this.parsePayload<Iteration>(row?.payload) ?? null;
  }

  listMessages(iterationId: number) {
    const rows = this.db
      .prepare("SELECT payload FROM messages WHERE iteration_id = ? ORDER BY id ASC")
      .all(iterationId) as Array<{ payload?: string }>;
    return rows
      .map((row) => this.parsePayload<IterationMessage>(row.payload))
      .filter((item): item is IterationMessage => Boolean(item));
  }

  listAuditLogs(limit = 50) {
    const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
    const rows = this.db
      .prepare("SELECT payload FROM audit_logs ORDER BY id DESC LIMIT ?")
      .all(normalizedLimit) as Array<{ payload?: string }>;
    return rows
      .map((row) => this.parsePayload<AuditLog>(row.payload))
      .filter((item): item is AuditLog => Boolean(item));
  }

  insertProject(project: Project) {
    this.db
      .prepare("INSERT INTO projects (id, name, description, status, last_updated, payload) VALUES (?, ?, ?, ?, ?, ?)")
      .run(project.id, project.name, project.description, project.status, project.lastUpdated || null, JSON.stringify(project));
  }

  updateProject(project: Project) {
    this.db
      .prepare("UPDATE projects SET name = ?, description = ?, status = ?, last_updated = ?, payload = ? WHERE id = ?")
      .run(project.name, project.description, project.status, project.lastUpdated || null, JSON.stringify(project), project.id);
  }

  insertIteration(iteration: Iteration) {
    this.db
      .prepare("INSERT INTO iterations (id, project_id, status, current_flag, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        iteration.id,
        iteration.projectId,
        iteration.status,
        iteration.current ? 1 : 0,
        iteration.createdAt,
        JSON.stringify(iteration)
      );
  }

  updateIteration(iteration: Iteration) {
    this.db
      .prepare("UPDATE iterations SET project_id = ?, status = ?, current_flag = ?, created_at = ?, payload = ? WHERE id = ?")
      .run(
        iteration.projectId,
        iteration.status,
        iteration.current ? 1 : 0,
        iteration.createdAt,
        JSON.stringify(iteration),
        iteration.id
      );
  }

  clearProjectCurrentIterations(projectId: number) {
    this.db.prepare("UPDATE iterations SET current_flag = 0 WHERE project_id = ?").run(projectId);
  }

  insertMessage(message: IterationMessage) {
    this.db
      .prepare("INSERT INTO messages (id, iteration_id, created_at, payload) VALUES (?, ?, ?, ?)")
      .run(message.id, message.iterationId, message.createdAt, JSON.stringify(message));
  }

  insertAuditLog(log: AuditLog) {
    this.db
      .prepare("INSERT INTO audit_logs (id, action, resource, created_at, payload) VALUES (?, ?, ?, ?, ?)")
      .run(log.id, log.action, log.resource, log.createdAt, JSON.stringify(log));
  }

  private initTypedTables() {
    this.db.exec(`
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
  }

  private syncTypedTables(data: WorkspaceStore) {
    this.db.exec("DELETE FROM projects; DELETE FROM iterations; DELETE FROM messages; DELETE FROM audit_logs;");
    const projectStmt = this.db.prepare("INSERT INTO projects (id, name, description, status, last_updated, payload) VALUES (?, ?, ?, ?, ?, ?)");
    for (const item of data.projects) {
      projectStmt.run(item.id, item.name, item.description, item.status, item.lastUpdated || null, JSON.stringify(item));
    }
    const iterationStmt = this.db.prepare("INSERT INTO iterations (id, project_id, status, current_flag, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)");
    for (const item of data.iterations) {
      iterationStmt.run(item.id, item.projectId, item.status, item.current ? 1 : 0, item.createdAt, JSON.stringify(item));
    }
    const messageStmt = this.db.prepare("INSERT INTO messages (id, iteration_id, created_at, payload) VALUES (?, ?, ?, ?)");
    for (const item of data.messages) {
      messageStmt.run(item.id, item.iterationId, item.createdAt, JSON.stringify(item));
    }
    const auditStmt = this.db.prepare("INSERT INTO audit_logs (id, action, resource, created_at, payload) VALUES (?, ?, ?, ?, ?)");
    for (const item of data.auditLogs) {
      auditStmt.run(item.id, item.action, item.resource, item.createdAt, JSON.stringify(item));
    }
  }
}
