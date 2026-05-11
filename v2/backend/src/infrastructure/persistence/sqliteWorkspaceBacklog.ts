import type { DatabaseSync } from "node:sqlite";
import type { BacklogItem, CreateBacklogItemInput } from "../../domain/workspace/backlogTypes";

export class SqliteWorkspaceBacklog {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  listBacklogItems(projectId: number): BacklogItem[] {
    const rows = this.db
      .prepare("SELECT * FROM backlog_items WHERE project_id = ? ORDER BY id DESC")
      .all(projectId) as RawBacklogRow[];
    return rows.map(toBacklogItem);
  }

  findBacklogItem(itemId: number): BacklogItem | null {
    const row = this.db
      .prepare("SELECT * FROM backlog_items WHERE id = ?")
      .get(itemId) as RawBacklogRow | undefined;
    return row ? toBacklogItem(row) : null;
  }

  createBacklogItem(projectId: number, input: CreateBacklogItemInput, createdBy: string): BacklogItem {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO backlog_items (project_id, iteration_id, title, description, priority, status, source, source_ref, tags, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const iterationId = input.iterationId ?? null;
    const status = iterationId ? "planned" : "open";
    stmt.run(
      projectId,
      iterationId,
      input.title,
      input.description || "",
      input.priority || "medium",
      status,
      input.source || "internal",
      input.sourceRef || "",
      JSON.stringify(input.tags || []),
      createdBy,
      now,
      now
    );
    const id = (this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
    return this.findBacklogItem(id)!;
  }

  updateBacklogItem(item: BacklogItem): void {
    this.db.prepare(`
      UPDATE backlog_items
      SET iteration_id = ?, title = ?, description = ?, priority = ?, status = ?,
          source = ?, source_ref = ?, tags = ?, updated_at = ?
      WHERE id = ?
    `).run(
      item.iterationId,
      item.title,
      item.description,
      item.priority,
      item.status,
      item.source,
      item.sourceRef,
      JSON.stringify(item.tags),
      new Date().toISOString(),
      item.id
    );
  }

  deleteBacklogItem(itemId: number): boolean {
    const result = this.db.prepare("DELETE FROM backlog_items WHERE id = ?").run(itemId);
    return result.changes > 0;
  }

  listBacklogItemsByIteration(iterationId: number): BacklogItem[] {
    const rows = this.db
      .prepare("SELECT * FROM backlog_items WHERE iteration_id = ? ORDER BY id DESC")
      .all(iterationId) as RawBacklogRow[];
    return rows.map(toBacklogItem);
  }
}

type RawBacklogRow = {
  id: number;
  project_id: number;
  iteration_id: number | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  source: string;
  source_ref: string;
  tags: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function toBacklogItem(row: RawBacklogRow): BacklogItem {
  let tags: string[] = [];
  try { tags = JSON.parse(row.tags); } catch { /* empty */ }
  return {
    id: row.id,
    projectId: row.project_id,
    iterationId: row.iteration_id,
    title: row.title,
    description: row.description,
    priority: row.priority as BacklogItem["priority"],
    status: row.status as BacklogItem["status"],
    source: row.source as BacklogItem["source"],
    sourceRef: row.source_ref,
    tags,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
