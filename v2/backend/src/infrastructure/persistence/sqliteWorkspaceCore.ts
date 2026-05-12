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
import type { KnowledgeGraphCache, KnowledgeGraphData } from "../../domain/workspace/knowledgeGraphTypes";
import { initialSchema } from "./migrations/001_initial_schema";
import { fixOrphanTenant } from "./migrations/002_fix_orphan_tenant";
import { analysisPipelinePersistence } from "./migrations/003_analysis_pipeline_persistence";
import { backlogAndKnowledge } from "./migrations/004_backlog_and_knowledge";
import { knowledgeGroup } from "./migrations/005_knowledge_group";
import { knowledgeGraph } from "./migrations/006_knowledge_graph";
import { experiencePoliciesAndExtractions } from "./migrations/007_experience_policies_and_extractions";
import { assistantConversations } from "./migrations/008_assistant_conversations";
import { runMigrations } from "./migrations/migrationRunner";

const seedStore: WorkspaceStore = {
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
  tenantMemberBindings: [],
  platformRoleBindings: [],
  governanceCustomRoles: [],
  uploads: [],
  ingestJobs: []
};

const collectionKeys: Array<keyof WorkspaceStore> = [
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
  "tenantMemberBindings",
  "platformRoleBindings",
  "governanceCustomRoles",
  "uploads",
  "ingestJobs"
];

function toArray<T>(value: unknown): T[] {
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
  private readonly bootstrapMode: "seed" | "empty";

  constructor(dbFile: string, seedDataFile?: string, options?: { bootstrapMode?: "seed" | "empty" }) {
    this.seedDataFile = seedDataFile;
    this.bootstrapMode = options?.bootstrapMode === "empty" ? "empty" : "seed";
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
    runMigrations(this.db, [initialSchema, fixOrphanTenant, analysisPipelinePersistence, backlogAndKnowledge, knowledgeGroup, knowledgeGraph, experiencePoliciesAndExtractions, assistantConversations]);
  }

  private initialStore(): WorkspaceStore {
    return this.bootstrapMode === "empty"
      ? {
          projects: [],
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
          tenantMemberBindings: [],
          platformRoleBindings: [],
          governanceCustomRoles: [],
          uploads: [],
          ingestJobs: []
        }
      : seedStore;
  }

  private static readonly NEXT_ID_SQL: Record<string, string> = {
    projects: "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM projects",
    iterations: "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM iterations",
    messages: "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM messages",
    audit_logs: "SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM audit_logs",
  };

  nextIdFromTable(table: "projects" | "iterations" | "messages" | "audit_logs") {
    const sql = SqliteWorkspaceCore.NEXT_ID_SQL[table];
    if (!sql) throw new Error(`Unknown table: ${table}`);
    const row = this.db.prepare(sql).get() as { next_id?: number } | undefined;
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
      if (this.bootstrapMode === "seed" && this.seedDataFile && existsSync(this.seedDataFile)) {
        const raw = readFileSync(this.seedDataFile, "utf-8");
        const seeded = JSON.parse(raw) as WorkspaceStore;
        this.writeStore(seeded);
        return seeded;
      }
      const initial = this.initialStore();
      this.writeStore(initial);
      return initial;
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
      tenantMemberBindings: toArray(parsed.tenantMemberBindings),
      platformRoleBindings: toArray(parsed.platformRoleBindings),
      governanceCustomRoles: toArray(parsed.governanceCustomRoles),
      uploads: toArray(parsed.uploads),
      ingestJobs: toArray(parsed.ingestJobs)
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

  listMessages(iterationId: number, opts?: { limit?: number; offset?: number }) {
    const limit = opts?.limit && Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 500;
    const offset = opts?.offset && Number.isInteger(opts.offset) && opts.offset >= 0 ? opts.offset : 0;
    const rows = this.db
      .prepare("SELECT payload FROM messages WHERE iteration_id = ? ORDER BY id ASC LIMIT ? OFFSET ?")
      .all(iterationId, limit, offset) as Array<{ payload?: string }>;
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

  deleteIteration(iterationId: number): boolean {
    const result = this.db.prepare("DELETE FROM iterations WHERE id = ?").run(iterationId);
    this.db.prepare("DELETE FROM messages WHERE iteration_id = ?").run(iterationId);
    return (result as { changes: number }).changes > 0;
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

  private syncEntityTable<T extends { id: number | string }>(
    tableName: string,
    upsertSql: string,
    extractRow: (item: T) => (string | number | null)[],
    data: T[]
  ) {
    const ids = new Set(data.map((item) => item.id));
    const upsertStmt = this.db.prepare(upsertSql);
    for (const item of data) {
      upsertStmt.run(...extractRow(item));
    }
    const existing = (this.db.prepare(`SELECT id FROM ${tableName}`).all() as Array<{ id: number | string }>).map((r) => r.id);
    const deleteStmt = this.db.prepare(`DELETE FROM ${tableName} WHERE id = ?`);
    for (const id of existing) {
      if (!ids.has(id)) deleteStmt.run(id);
    }
  }

  private syncTypedTables(data: WorkspaceStore) {
    this.syncEntityTable("projects",
      `INSERT INTO projects (id, name, description, status, last_updated, payload) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, status=excluded.status, last_updated=excluded.last_updated, payload=excluded.payload`,
      (item) => [item.id, item.name, item.description, item.status, item.lastUpdated || null, JSON.stringify(item)],
      data.projects
    );
    this.syncEntityTable("iterations",
      `INSERT INTO iterations (id, project_id, status, current_flag, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id, status=excluded.status, current_flag=excluded.current_flag, created_at=excluded.created_at, payload=excluded.payload`,
      (item) => [item.id, item.projectId, item.status, item.current ? 1 : 0, item.createdAt, JSON.stringify(item)],
      data.iterations
    );
    this.syncEntityTable("messages",
      `INSERT INTO messages (id, iteration_id, created_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET iteration_id=excluded.iteration_id, created_at=excluded.created_at, payload=excluded.payload`,
      (item) => [item.id, item.iterationId, item.createdAt, JSON.stringify(item)],
      data.messages
    );
    this.syncEntityTable("audit_logs",
      `INSERT INTO audit_logs (id, action, resource, created_at, payload) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET action=excluded.action, resource=excluded.resource, created_at=excluded.created_at, payload=excluded.payload`,
      (item) => [item.id, item.action, item.resource, item.createdAt, JSON.stringify(item)],
      data.auditLogs
    );
  }

  // ── Knowledge Graph Cache ──

  getKnowledgeGraphCache(projectId: number): KnowledgeGraphCache | null {
    const row = this.db.prepare(
      "SELECT project_id, graph_data, entry_count, generated_at FROM knowledge_graph_cache WHERE project_id = ?"
    ).get(projectId) as { project_id: number; graph_data: string; entry_count: number; generated_at: string } | undefined;
    if (!row) return null;
    return {
      projectId: row.project_id,
      graphData: JSON.parse(row.graph_data) as KnowledgeGraphData,
      entryCount: row.entry_count,
      generatedAt: row.generated_at,
    };
  }

  saveKnowledgeGraphCache(projectId: number, graphData: KnowledgeGraphData, entryCount: number): KnowledgeGraphCache {
    const now = new Date().toISOString();
    const json = JSON.stringify(graphData);
    this.db.prepare(
      `INSERT INTO knowledge_graph_cache (project_id, graph_data, entry_count, generated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET graph_data = excluded.graph_data, entry_count = excluded.entry_count, generated_at = excluded.generated_at`
    ).run(projectId, json, entryCount, now);
    return { projectId, graphData, entryCount, generatedAt: now };
  }
}
