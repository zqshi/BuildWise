import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspaceRoot = resolve(process.cwd(), "..");
const jsonFile = process.env.WORKSPACE_DATA_FILE || resolve(workspaceRoot, "backend", "data.json");
const dbFile = process.env.WORKSPACE_DB_FILE || resolve(workspaceRoot, "backend", "workspace.db");

if (!existsSync(jsonFile)) {
  console.error(`JSON workspace file not found: ${jsonFile}`);
  process.exit(1);
}

const dbDir = dirname(dbFile);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const payload = readFileSync(jsonFile, "utf-8");
const parsed = JSON.parse(payload);
if (!parsed || typeof parsed !== "object") {
  console.error("Invalid workspace JSON payload");
  process.exit(1);
}

const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_collections (
    collection_name TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
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
const keys = [
  "projects",
  "iterations",
  "messages",
  "snapshots",
  "transitions",
  "auditLogs",
  "versionSnapshots",
  "projectShares",
  "deployments",
  "templateRuns"
];
const upsert = db.prepare(`
  INSERT INTO workspace_collections (collection_name, payload, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(collection_name) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);
const now = new Date().toISOString();
const projectUpsert = db.prepare(`
  INSERT INTO projects (id, name, description, status, last_updated, payload)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    status = excluded.status,
    last_updated = excluded.last_updated,
    payload = excluded.payload
`);
const iterationUpsert = db.prepare(`
  INSERT INTO iterations (id, project_id, status, current_flag, created_at, payload)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    status = excluded.status,
    current_flag = excluded.current_flag,
    created_at = excluded.created_at,
    payload = excluded.payload
`);
const messageUpsert = db.prepare(`
  INSERT INTO messages (id, iteration_id, created_at, payload)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    iteration_id = excluded.iteration_id,
    created_at = excluded.created_at,
    payload = excluded.payload
`);
const auditUpsert = db.prepare(`
  INSERT INTO audit_logs (id, action, resource, created_at, payload)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    action = excluded.action,
    resource = excluded.resource,
    created_at = excluded.created_at,
    payload = excluded.payload
`);
db.exec("BEGIN IMMEDIATE TRANSACTION");
try {
  for (const key of keys) {
    const value = Array.isArray(parsed[key]) ? parsed[key] : [];
    upsert.run(key, JSON.stringify(value), now);
  }
  db.exec("DELETE FROM projects; DELETE FROM iterations; DELETE FROM messages; DELETE FROM audit_logs;");
  for (const item of Array.isArray(parsed.projects) ? parsed.projects : []) {
    projectUpsert.run(item.id, item.name, item.description, item.status, item.lastUpdated || null, JSON.stringify(item));
  }
  for (const item of Array.isArray(parsed.iterations) ? parsed.iterations : []) {
    iterationUpsert.run(item.id, item.projectId, item.status, item.current ? 1 : 0, item.createdAt, JSON.stringify(item));
  }
  for (const item of Array.isArray(parsed.messages) ? parsed.messages : []) {
    messageUpsert.run(item.id, item.iterationId, item.createdAt, JSON.stringify(item));
  }
  for (const item of Array.isArray(parsed.auditLogs) ? parsed.auditLogs : []) {
    auditUpsert.run(item.id, item.action, item.resource, item.createdAt, JSON.stringify(item));
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
db.close();

console.log(`Workspace migrated to SQLite: ${dbFile}`);
