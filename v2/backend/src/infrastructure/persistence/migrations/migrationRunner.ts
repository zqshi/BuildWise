import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  version: number;
  name: string;
  up(db: DatabaseSync): void;
  down?(db: DatabaseSync): void;
}

export function runMigrations(db: DatabaseSync, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const rows = db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[];
  const applied = new Set(rows.map((r) => r.version));
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const m of sorted) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      m.up(db);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        m.version,
        m.name,
        new Date().toISOString()
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export function rollbackMigration(db: DatabaseSync, migration: Migration): void {
  if (!migration.down) {
    throw new Error(`Migration ${migration.version} (${migration.name}) does not support rollback`);
  }
  db.exec("BEGIN IMMEDIATE TRANSACTION");
  try {
    migration.down(db);
    db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(migration.version);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw new Error(`Rollback of migration ${migration.version} (${migration.name}) failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
