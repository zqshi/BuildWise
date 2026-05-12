import type { DatabaseSync } from "node:sqlite";
import type { AssistantConversationRepository, AssistantMessage } from "../../domain/workspace/repository";

export class SqliteWorkspaceAssistantConversation implements AssistantConversationRepository {
  constructor(private db: DatabaseSync) {}

  listAssistantMessages(tenantId: string, limit = 50): AssistantMessage[] {
    const stmt = this.db.prepare(
      `SELECT id, tenant_id, role, content, metadata, created_at
       FROM assistant_messages
       WHERE tenant_id = ?
       ORDER BY id DESC
       LIMIT ?`
    );
    const rows = stmt.all(tenantId, limit) as Array<{
      id: number;
      tenant_id: string;
      role: string;
      content: string;
      metadata: string;
      created_at: string;
    }>;
    return rows.reverse().map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      role: r.role as "user" | "assistant",
      content: r.content,
      metadata: JSON.parse(r.metadata || "{}"),
      createdAt: r.created_at,
    }));
  }

  appendAssistantMessage(msg: Omit<AssistantMessage, "id">): AssistantMessage {
    const stmt = this.db.prepare(
      `INSERT INTO assistant_messages (tenant_id, role, content, metadata, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      msg.tenantId,
      msg.role,
      msg.content,
      JSON.stringify(msg.metadata),
      msg.createdAt
    );
    return { id: Number(result.lastInsertRowid), ...msg };
  }

  clearAssistantMessages(tenantId: string): void {
    const stmt = this.db.prepare(`DELETE FROM assistant_messages WHERE tenant_id = ?`);
    stmt.run(tenantId);
  }
}
