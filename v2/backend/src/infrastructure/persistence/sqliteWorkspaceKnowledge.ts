import type { DatabaseSync } from "node:sqlite";
import type { KnowledgeEntry, CreateKnowledgeEntryInput } from "../../domain/workspace/knowledgeTypes";

export class SqliteWorkspaceKnowledge {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  listKnowledgeEntries(projectId: number): KnowledgeEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_entries WHERE project_id = ? ORDER BY id DESC")
      .all(projectId) as RawKnowledgeRow[];
    return rows.map(toKnowledgeEntry);
  }

  findKnowledgeEntry(entryId: number): KnowledgeEntry | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_entries WHERE id = ?")
      .get(entryId) as RawKnowledgeRow | undefined;
    return row ? toKnowledgeEntry(row) : null;
  }

  createKnowledgeEntry(projectId: number, input: CreateKnowledgeEntryInput, createdBy: string): KnowledgeEntry {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO knowledge_entries (project_id, iteration_id, title, category, group_name, content, applicable_scene, tags, source, source_ref, status, created_by, reviewed_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      input.iterationId ?? null,
      input.title,
      input.category,
      input.groupName || "",
      input.content,
      input.applicableScene || "",
      JSON.stringify(input.tags || []),
      input.source || "manual",
      input.sourceRef || "",
      "draft",
      createdBy,
      "",
      now,
      now
    );
    const id = (this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
    const entry = this.findKnowledgeEntry(id);
    if (!entry) throw new Error(`knowledge entry ${id} not found after insert`);
    return entry;
  }

  updateKnowledgeEntry(entry: KnowledgeEntry): void {
    this.db.prepare(`
      UPDATE knowledge_entries
      SET iteration_id = ?, title = ?, category = ?, group_name = ?, content = ?, applicable_scene = ?,
          tags = ?, source = ?, source_ref = ?, status = ?, reviewed_by = ?, updated_at = ?
      WHERE id = ?
    `).run(
      entry.iterationId,
      entry.title,
      entry.category,
      entry.groupName,
      entry.content,
      entry.applicableScene,
      JSON.stringify(entry.tags),
      entry.source,
      entry.sourceRef,
      entry.status,
      entry.reviewedBy,
      new Date().toISOString(),
      entry.id
    );
  }

  deleteKnowledgeEntry(entryId: number): boolean {
    const result = this.db.prepare("DELETE FROM knowledge_entries WHERE id = ?").run(entryId);
    return result.changes > 0;
  }

  searchKnowledgeEntries(projectId: number, query: string, limit = 10): KnowledgeEntry[] {
    const pattern = `%${query}%`;
    const rows = this.db
      .prepare(`
        SELECT * FROM knowledge_entries
        WHERE project_id = ? AND (title LIKE ? OR content LIKE ? OR applicable_scene LIKE ? OR tags LIKE ?)
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(projectId, pattern, pattern, pattern, pattern, limit) as RawKnowledgeRow[];
    return rows.map(toKnowledgeEntry);
  }
}

type RawKnowledgeRow = {
  id: number;
  project_id: number;
  iteration_id: number | null;
  title: string;
  category: string;
  group_name: string;
  content: string;
  applicable_scene: string;
  tags: string;
  source: string;
  source_ref: string;
  status: string;
  created_by: string;
  reviewed_by: string;
  created_at: string;
  updated_at: string;
};

function toKnowledgeEntry(row: RawKnowledgeRow): KnowledgeEntry {
  let tags: string[] = [];
  try { tags = JSON.parse(row.tags); } catch { /* empty */ }
  return {
    id: row.id,
    projectId: row.project_id,
    iterationId: row.iteration_id,
    title: row.title,
    category: row.category as KnowledgeEntry["category"],
    groupName: row.group_name,
    content: row.content,
    applicableScene: row.applicable_scene,
    tags,
    source: row.source as KnowledgeEntry["source"],
    sourceRef: row.source_ref,
    status: row.status as KnowledgeEntry["status"],
    createdBy: row.created_by,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
