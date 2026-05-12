import type { DatabaseSync } from "node:sqlite";
import type { ExperiencePolicy, ExperienceExtractionRecord, ExperienceExtractionRule } from "../../domain/workspace/experiencePolicyTypes";
import type { KnowledgeEntry } from "../../domain/workspace/knowledgeTypes";

type RawPolicyRow = {
  id: number;
  scope: string;
  project_id: number;
  version: number;
  status: string;
  rules: string;
  schedule_scan_enabled: number;
  schedule_scan_interval_days: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type RawExtractionRow = {
  id: number;
  project_id: number;
  iteration_id: number | null;
  trigger_event: string;
  source_stage: string;
  source_digest: string;
  extracted_entry_ids: string;
  status: string;
  error_message: string;
  created_at: string;
};

function toPolicy(row: RawPolicyRow): ExperiencePolicy {
  let rules: ExperienceExtractionRule[] = [];
  try { rules = JSON.parse(row.rules); } catch { /* empty */ }
  return {
    id: row.id,
    scope: row.scope as ExperiencePolicy["scope"],
    projectId: row.project_id,
    version: row.version,
    status: row.status as ExperiencePolicy["status"],
    rules,
    scheduleScanEnabled: row.schedule_scan_enabled === 1,
    scheduleScanIntervalDays: row.schedule_scan_interval_days,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toExtraction(row: RawExtractionRow): ExperienceExtractionRecord {
  let entryIds: number[] = [];
  try { entryIds = JSON.parse(row.extracted_entry_ids); } catch { /* empty */ }
  return {
    id: row.id,
    projectId: row.project_id,
    iterationId: row.iteration_id,
    triggerEvent: row.trigger_event as ExperienceExtractionRecord["triggerEvent"],
    sourceStage: row.source_stage,
    sourceDigest: row.source_digest,
    extractedEntryIds: entryIds,
    status: row.status as ExperienceExtractionRecord["status"],
    errorMessage: row.error_message,
    createdAt: row.created_at
  };
}

export class SqliteWorkspaceExperience {
  private readonly db: DatabaseSync;
  constructor(db: DatabaseSync) { this.db = db; }

  listExperiencePolicies(projectId: number): ExperiencePolicy[] {
    const rows = this.db
      .prepare("SELECT * FROM experience_policies WHERE project_id = ? ORDER BY version DESC")
      .all(projectId) as RawPolicyRow[];
    return rows.map(toPolicy);
  }

  findActiveExperiencePolicy(projectId: number): ExperiencePolicy | null {
    const row = this.db
      .prepare("SELECT * FROM experience_policies WHERE project_id = ? AND status = 'active' ORDER BY version DESC LIMIT 1")
      .get(projectId) as RawPolicyRow | undefined;
    return row ? toPolicy(row) : null;
  }

  createExperiencePolicy(policy: Omit<ExperiencePolicy, "id">): ExperiencePolicy {
    this.db.prepare(`
      INSERT INTO experience_policies (scope, project_id, version, status, rules, schedule_scan_enabled, schedule_scan_interval_days, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      policy.scope,
      policy.projectId,
      policy.version,
      policy.status,
      JSON.stringify(policy.rules),
      policy.scheduleScanEnabled ? 1 : 0,
      policy.scheduleScanIntervalDays,
      policy.createdBy,
      policy.createdAt,
      policy.updatedAt
    );
    const id = (this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
    return { ...policy, id };
  }

  updateExperiencePolicy(policy: ExperiencePolicy): void {
    this.db.prepare(`
      UPDATE experience_policies
      SET scope = ?, version = ?, status = ?, rules = ?, schedule_scan_enabled = ?, schedule_scan_interval_days = ?, updated_at = ?
      WHERE id = ?
    `).run(
      policy.scope,
      policy.version,
      policy.status,
      JSON.stringify(policy.rules),
      policy.scheduleScanEnabled ? 1 : 0,
      policy.scheduleScanIntervalDays,
      new Date().toISOString(),
      policy.id
    );
  }

  deleteExperiencePolicy(policyId: number): boolean {
    const result = this.db.prepare("DELETE FROM experience_policies WHERE id = ?").run(policyId);
    return result.changes > 0;
  }

  listExperienceExtractions(projectId: number): ExperienceExtractionRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM experience_extractions WHERE project_id = ? ORDER BY id DESC")
      .all(projectId) as RawExtractionRow[];
    return rows.map(toExtraction);
  }

  appendExperienceExtraction(extraction: Omit<ExperienceExtractionRecord, "id">): ExperienceExtractionRecord {
    this.db.prepare(`
      INSERT INTO experience_extractions (project_id, iteration_id, trigger_event, source_stage, source_digest, extracted_entry_ids, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      extraction.projectId,
      extraction.iterationId,
      extraction.triggerEvent,
      extraction.sourceStage,
      extraction.sourceDigest,
      JSON.stringify(extraction.extractedEntryIds),
      extraction.status,
      extraction.errorMessage,
      extraction.createdAt
    );
    const id = (this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
    return { ...extraction, id };
  }

  searchKnowledgeAcrossProjects(tenantId: string, query: string, limit = 20): KnowledgeEntry[] {
    const pattern = `%${query}%`;
    type RawRow = {
      id: number; project_id: number; iteration_id: number | null;
      title: string; category: string; group_name: string; content: string;
      applicable_scene: string; tags: string; source: string; source_ref: string;
      status: string; created_by: string; reviewed_by: string;
      created_at: string; updated_at: string;
      experience_scope: string; confidence: number; extraction_ref: number | null;
    };
    const rows = this.db.prepare(`
      SELECT ke.* FROM knowledge_entries ke
      INNER JOIN projects p ON ke.project_id = p.id
      WHERE (p.tenant_id = ? OR p.tenant_id IS NULL)
        AND ke.status = 'published'
        AND (ke.title LIKE ? OR ke.content LIKE ? OR ke.applicable_scene LIKE ?)
      ORDER BY ke.id DESC
      LIMIT ?
    `).all(tenantId, pattern, pattern, pattern, limit) as RawRow[];

    return rows.map((row) => {
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
        updatedAt: row.updated_at,
        experienceScope: row.experience_scope || undefined,
        confidence: row.confidence || undefined,
        extractionRef: row.extraction_ref || undefined
      } as KnowledgeEntry;
    });
  }
}
