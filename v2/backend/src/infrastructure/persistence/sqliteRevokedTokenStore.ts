import type { DatabaseSync } from "node:sqlite";
import type { RevokedTokenStore } from "../runtime/jwt";
import { createHmac } from "node:crypto";

/**
 * Persists revoked refresh tokens in SQLite so they survive restarts.
 * Token strings are stored as SHA-256 hashes to avoid keeping raw JWTs on disk.
 */
export class SqliteRevokedTokenStore implements RevokedTokenStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        token_hash TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )
    `);
  }

  private hash(token: string): string {
    return createHmac("sha256", "revoked").update(token).digest("hex");
  }

  revoke(token: string, expiresAt: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)")
      .run(this.hash(token), expiresAt);
    // Purge expired entries periodically
    this.db.prepare("DELETE FROM revoked_tokens WHERE expires_at <= ?").run(Math.floor(Date.now() / 1000));
  }

  isRevoked(token: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const row = this.db
      .prepare("SELECT expires_at FROM revoked_tokens WHERE token_hash = ?")
      .get(this.hash(token)) as { expires_at?: number } | undefined;
    if (!row) return false;
    if (row.expires_at! <= now) {
      this.db.prepare("DELETE FROM revoked_tokens WHERE token_hash = ?").run(this.hash(token));
      return false;
    }
    return true;
  }
}
