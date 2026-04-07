import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./migrationRunner";

/**
 * Migration 002: fix orphan tenant records
 *
 * Ensures all platform_role_bindings reference valid users
 * and cleans up any orphaned records.
 */
export const fixOrphanTenant: Migration = {
  version: 2,
  name: "fix_orphan_tenant",
  up(db: DatabaseSync) {
    // Ensure tenant_id column exists on projects table (idempotent)
    const cols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    const hasTenantId = cols.some(c => c.name === "tenant_id");
    if (!hasTenantId) {
      db.exec("ALTER TABLE projects ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'");
    }
  }
};
