"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteWorkspaceCore = exports.collectionKeys = exports.seedStore = void 0;
exports.toArray = toArray;
exports.toRepoSlug = toRepoSlug;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_sqlite_1 = require("node:sqlite");
exports.seedStore = {
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
    opsTriageTemplates: []
};
exports.collectionKeys = [
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
    "opsTriageTemplates"
];
function toArray(value) {
    return Array.isArray(value) ? value : [];
}
function toRepoSlug(value, fallback) {
    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || fallback;
}
class SqliteWorkspaceCore {
    constructor(dbFile, seedDataFile) {
        this.dbFile = dbFile;
        this.seedDataFile = seedDataFile;
        const dir = (0, node_path_1.dirname)(dbFile);
        if (!(0, node_fs_1.existsSync)(dir)) {
            (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        }
        this.db = new node_sqlite_1.DatabaseSync(dbFile);
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
    nextIdFromTable(table) {
        const row = this.db
            .prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${table}`)
            .get();
        return Number(row?.next_id || 1);
    }
    parsePayload(payload) {
        if (!payload) {
            return null;
        }
        try {
            return JSON.parse(payload);
        }
        catch {
            return null;
        }
    }
    readCollection(name) {
        const row = this.db
            .prepare("SELECT payload FROM workspace_collections WHERE collection_name = ?")
            .get(name);
        const parsed = this.parsePayload(row?.payload);
        return Array.isArray(parsed) ? parsed : [];
    }
    writeCollection(name, items) {
        this.db
            .prepare(`
        INSERT INTO workspace_collections (collection_name, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(collection_name) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `)
            .run(name, JSON.stringify(items), new Date().toISOString());
    }
    readStore() {
        const hasDataRow = this.db
            .prepare("SELECT 1 AS ok FROM workspace_collections WHERE collection_name = ? LIMIT 1")
            .get("projects");
        if (!hasDataRow?.ok) {
            if (this.seedDataFile && (0, node_fs_1.existsSync)(this.seedDataFile)) {
                const raw = (0, node_fs_1.readFileSync)(this.seedDataFile, "utf-8");
                const seeded = JSON.parse(raw);
                this.writeStore(seeded);
                return seeded;
            }
            this.writeStore(exports.seedStore);
            return exports.seedStore;
        }
        const parsed = {};
        const stmt = this.db.prepare("SELECT payload FROM workspace_collections WHERE collection_name = ?");
        for (const key of exports.collectionKeys) {
            const row = stmt.get(key);
            const payload = row?.payload;
            if (!payload) {
                parsed[key] = [];
                continue;
            }
            try {
                parsed[key] = JSON.parse(payload);
            }
            catch {
                parsed[key] = [];
            }
        }
        return {
            projects: toArray(parsed.projects),
            iterations: toArray(parsed.iterations),
            messages: toArray(parsed.messages),
            snapshots: toArray(parsed.snapshots),
            transitions: toArray(parsed.transitions),
            auditLogs: toArray(parsed.auditLogs),
            versionSnapshots: toArray(parsed.versionSnapshots),
            projectShares: toArray(parsed.projectShares),
            deployments: toArray(parsed.deployments),
            templateRuns: toArray(parsed.templateRuns),
            opsTriageTemplates: toArray(parsed.opsTriageTemplates)
        };
    }
    writeStore(data) {
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
            for (const key of exports.collectionKeys) {
                upsert.run(key, JSON.stringify(data[key]), now);
            }
            this.syncTypedTables(data);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    listProjects() {
        const rows = this.db
            .prepare("SELECT payload FROM projects ORDER BY id ASC")
            .all();
        return rows
            .map((row) => this.parsePayload(row.payload))
            .filter((item) => Boolean(item));
    }
    findProject(projectId) {
        const row = this.db
            .prepare("SELECT payload FROM projects WHERE id = ? LIMIT 1")
            .get(projectId);
        return this.parsePayload(row?.payload) ?? null;
    }
    listIterations(projectId) {
        const rows = this.db
            .prepare("SELECT payload FROM iterations WHERE project_id = ? ORDER BY id ASC")
            .all(projectId);
        return rows
            .map((row) => this.parsePayload(row.payload))
            .filter((item) => Boolean(item));
    }
    findIteration(iterationId) {
        const row = this.db
            .prepare("SELECT payload FROM iterations WHERE id = ? LIMIT 1")
            .get(iterationId);
        return this.parsePayload(row?.payload) ?? null;
    }
    findPreviousIteration(iteration) {
        const row = this.db
            .prepare("SELECT payload FROM iterations WHERE project_id = ? AND id < ? ORDER BY id DESC LIMIT 1")
            .get(iteration.projectId, iteration.id);
        return this.parsePayload(row?.payload) ?? null;
    }
    listMessages(iterationId) {
        const rows = this.db
            .prepare("SELECT payload FROM messages WHERE iteration_id = ? ORDER BY id ASC")
            .all(iterationId);
        return rows
            .map((row) => this.parsePayload(row.payload))
            .filter((item) => Boolean(item));
    }
    listAuditLogs(limit = 50) {
        const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
        const rows = this.db
            .prepare("SELECT payload FROM audit_logs ORDER BY id DESC LIMIT ?")
            .all(normalizedLimit);
        return rows
            .map((row) => this.parsePayload(row.payload))
            .filter((item) => Boolean(item));
    }
    insertProject(project) {
        this.db
            .prepare("INSERT INTO projects (id, name, description, status, last_updated, payload) VALUES (?, ?, ?, ?, ?, ?)")
            .run(project.id, project.name, project.description, project.status, project.lastUpdated || null, JSON.stringify(project));
    }
    updateProject(project) {
        this.db
            .prepare("UPDATE projects SET name = ?, description = ?, status = ?, last_updated = ?, payload = ? WHERE id = ?")
            .run(project.name, project.description, project.status, project.lastUpdated || null, JSON.stringify(project), project.id);
    }
    insertIteration(iteration) {
        this.db
            .prepare("INSERT INTO iterations (id, project_id, status, current_flag, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)")
            .run(iteration.id, iteration.projectId, iteration.status, iteration.current ? 1 : 0, iteration.createdAt, JSON.stringify(iteration));
    }
    updateIteration(iteration) {
        this.db
            .prepare("UPDATE iterations SET project_id = ?, status = ?, current_flag = ?, created_at = ?, payload = ? WHERE id = ?")
            .run(iteration.projectId, iteration.status, iteration.current ? 1 : 0, iteration.createdAt, JSON.stringify(iteration), iteration.id);
    }
    clearProjectCurrentIterations(projectId) {
        this.db.prepare("UPDATE iterations SET current_flag = 0 WHERE project_id = ?").run(projectId);
    }
    insertMessage(message) {
        this.db
            .prepare("INSERT INTO messages (id, iteration_id, created_at, payload) VALUES (?, ?, ?, ?)")
            .run(message.id, message.iterationId, message.createdAt, JSON.stringify(message));
    }
    insertAuditLog(log) {
        this.db
            .prepare("INSERT INTO audit_logs (id, action, resource, created_at, payload) VALUES (?, ?, ?, ?, ?)")
            .run(log.id, log.action, log.resource, log.createdAt, JSON.stringify(log));
    }
    initTypedTables() {
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
    `);
    }
    syncTypedTables(data) {
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
exports.SqliteWorkspaceCore = SqliteWorkspaceCore;
