import type { DatabaseSync } from "node:sqlite";
import type { KnowledgeGraphCache, KnowledgeGraphData } from "../../domain/workspace/knowledgeGraphTypes";

export class SqliteKnowledgeGraph {
  constructor(private readonly db: DatabaseSync) {}

  getGraphCache(projectId: number): KnowledgeGraphCache | null {
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

  saveGraphCache(projectId: number, graphData: KnowledgeGraphData, entryCount: number): KnowledgeGraphCache {
    const now = new Date().toISOString();
    const json = JSON.stringify(graphData);
    this.db.prepare(
      `INSERT INTO knowledge_graph_cache (project_id, graph_data, entry_count, generated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET graph_data = excluded.graph_data, entry_count = excluded.entry_count, generated_at = excluded.generated_at`
    ).run(projectId, json, entryCount, now);
    return { projectId, graphData, entryCount, generatedAt: now };
  }

  deleteGraphCache(projectId: number): boolean {
    const result = this.db.prepare("DELETE FROM knowledge_graph_cache WHERE project_id = ?").run(projectId);
    return result.changes > 0;
  }
}
