import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AssessmentSnapshot,
  AuditLog,
  CreateIterationInput,
  DeploymentRecord,
  Iteration,
  IterationMessage,
  IterationTransition,
  GovernanceCustomRoleRecord,
  PlatformRoleBindingRecord,
  PolicyExecutionLogRecord,
  Project,
  ProjectPolicyRecord,
  ProjectRoleBindingRecord,
  TenantMemberBindingRecord,
  ProjectShare,
  ProjectWorkspaceBindingRecord,
  TemplateRunRecord,
  VersionSnapshot,
  WorkspaceStore
} from "../../domain/workspace/types";
import type {
  AttachmentAnalysisJob,
  AttachmentReportIndex,
  AttachmentReportSection,
  AttachmentUploadRecord,
  AttachmentIngestJob
} from "../../domain/workspace/analysisTypes";
import { nextThreePartVersion } from "../../domain/workspace/versioning";
import { SqliteWorkspaceCore } from "./sqliteWorkspaceCore";

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly core: SqliteWorkspaceCore;

  constructor(dbFile: string, seedDataFile?: string, options?: { bootstrapMode?: "seed" | "empty" }) {
    this.core = new SqliteWorkspaceCore(dbFile, seedDataFile, options);
    this.core.readStore();
  }

  /** Expose the underlying DatabaseSync for cross-cutting concerns (e.g. revoked-token store). */
  getDb() {
    return this.core.db;
  }

  read(): WorkspaceStore {
    return this.core.readStore();
  }

  write(data: WorkspaceStore) {
    this.core.writeStore(data);
  }

  nextId(items: { id: number }[]) {
    return items.length === 0 ? 1 : Math.max(...items.map((item) => item.id)) + 1;
  }

  listProjects() {
    return this.core.listProjects();
  }

  findProject(projectId: number) {
    return this.core.findProject(projectId);
  }

  createProject(input: Pick<Project, "name" | "description" | "tenantId" | "ownerUserId">) {
    const id = this.core.nextIdFromTable("projects");
    const now = new Date().toISOString();
    const created: Project = {
      id,
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      name: input.name,
      description: input.description,
      status: "in-progress",
      lastUpdated: now.slice(0, 10),
      repository: {
        id: `repo-${id}`,
        repoMode: "none",
        provider: "",
        organization: "",
        name: "",
        url: "",
        defaultBranch: "main",
        structureVersion: "v1",
        layout: [],
        remote: {
          status: "unprovisioned",
          visibility: "private",
          ownerType: "org",
          providerRepoId: "",
          htmlUrl: "",
          cloneUrl: "",
          sshUrl: "",
          lastProvisionedAt: ""
        },
        governance: {
          requireRemoteForProduction: true,
          requireRemoteForStaging: false
        },
        health: {
          remoteConfigured: false,
          remoteReachable: false,
          remoteSynced: false,
          lastCheckedAt: "",
          lastError: ""
        },
        createdAt: now,
        updatedAt: now
      }
    };

    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.insertProject(created);
      const items = this.core.readCollection<Project>("projects");
      items.push(created);
      this.core.writeCollection("projects", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return created;
  }

  listIterations(projectId: number) {
    return this.core.listIterations(projectId);
  }

  findIteration(iterationId: number) {
    return this.core.findIteration(iterationId);
  }

  findPreviousIteration(iteration: Iteration) {
    return this.core.findPreviousIteration(iteration);
  }

  deleteIteration(iterationId: number): boolean {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      const result = this.core.deleteIteration(iterationId);
      // 对齐 JSON 版本：清理 JSON 集合中的关联数据
      const iterations = this.core.readCollection<Iteration>("iterations");
      this.core.writeCollection("iterations", iterations.filter((item) => item.id !== iterationId));
      const snapshots = this.core.readCollection<{ iterationId: number }>("snapshots");
      this.core.writeCollection("snapshots", snapshots.filter((s) => s.iterationId !== iterationId));
      const transitions = this.core.readCollection<{ iterationId: number }>("transitions");
      this.core.writeCollection("transitions", transitions.filter((t) => t.iterationId !== iterationId));
      const logs = this.core.readCollection<{ iterationId: number }>("policyExecutionLogs");
      this.core.writeCollection("policyExecutionLogs", logs.filter((l) => l.iterationId !== iterationId));
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  createIteration(projectId: number, payload: CreateIterationInput) {
    const existing = this.core.listIterations(projectId);
    const version = nextThreePartVersion(existing, payload.versionType || "patch");
    const goals = Array.isArray(payload.goals) && payload.goals.length > 0 ? payload.goals : [];
    const created: Iteration = {
      id: this.core.nextIdFromTable("iterations"),
      projectId,
      version,
      name: payload.name,
      description: payload.description,
      goals,
      modules: goals.length > 0 ? goals.map((goal, idx) => ({
        id: `module-${Date.now()}-${idx}`,
        title: goal,
        status: "planned"
      })) : [],
      status: "in-progress",
      progress: 0,
      createdAt: new Date().toISOString().slice(0, 10),
      createdBy: "系统",
      current: true,
      aiSummary: payload.aiSummary || `基于项目目标，${payload.name} 进入执行。`,
      scope: payload.scope ?? {
        inScope: goals,
        outOfScope: [],
        acceptanceCriteria: goals.length > 0 ? goals.map((goal) => `${goal} 可演示并通过验收`) : []
      },
      continuity: payload.continuity ?? {
        inheritedFromIterationId: existing.length > 0 ? existing[existing.length - 1].id : null,
        inheritedSummary: existing.length > 0 ? `继承 ${existing[existing.length - 1].name}` : "首个迭代，无需继承。",
        carriedGoals: [],
        carriedRisks: [],
        carriedDecisions: []
      },
      assessment: payload.assessment ?? {
        baselineIterationId: existing.length > 0 ? existing[existing.length - 1].id : null,
        baselineIterationName: existing.length > 0 ? existing[existing.length - 1].name : "无基线",
        currentSummary: payload.aiSummary || `${payload.name} 进入执行阶段`,
        deltaInScope: goals.map((goal) => `+ ${goal}`),
        resolvedItems: [],
        pendingItems: goals,
        risks: []
      }
    };

    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.clearProjectCurrentIterations(projectId);
      this.core.insertIteration(created);
      const items = this.core.readCollection<Iteration>("iterations");
      for (const item of items) {
        if (item.projectId === projectId) {
          item.current = false;
        }
      }
      items.push(created);
      this.core.writeCollection("iterations", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return created;
  }

  listMessages(iterationId: number, opts?: { limit?: number; offset?: number }) {
    return this.core.listMessages(iterationId, opts);
  }

  createMessage(iterationId: number, role: IterationMessage["role"], content: string) {
    const created: IterationMessage = {
      id: this.core.nextIdFromTable("messages"),
      iterationId,
      role,
      content,
      createdAt: new Date().toISOString()
    };

    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.insertMessage(created);
      const items = this.core.readCollection<IterationMessage>("messages");
      items.push(created);
      this.core.writeCollection("messages", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return created;
  }

  listSnapshots(iterationId: number) {
    return this.core.readCollection<AssessmentSnapshot>("snapshots").filter((item) => item.iterationId === iterationId);
  }

  listTransitions(iterationId: number) {
    return this.core.readCollection<IterationTransition>("transitions").filter((item) => item.iterationId === iterationId);
  }

  appendSnapshot(snapshot: AssessmentSnapshot) {
    const items = this.core.readCollection<AssessmentSnapshot>("snapshots");
    items.push(snapshot);
    this.core.writeCollection("snapshots", items);
  }

  appendTransition(transition: IterationTransition) {
    const items = this.core.readCollection<IterationTransition>("transitions");
    items.push(transition);
    this.core.writeCollection("transitions", items);
  }

  listAuditLogs(limit = 50) {
    return this.core.listAuditLogs(limit);
  }

  appendAuditLog(log: AuditLog) {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.insertAuditLog(log);
      const items = this.core.readCollection<AuditLog>("auditLogs");
      items.push(log);
      this.core.writeCollection("auditLogs", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  listVersionSnapshots(projectId: number) {
    return this.core.readCollection<VersionSnapshot>("versionSnapshots").filter((item) => item.projectId === projectId);
  }

  appendVersionSnapshot(snapshot: VersionSnapshot) {
    const items = this.core.readCollection<VersionSnapshot>("versionSnapshots");
    items.push(snapshot);
    this.core.writeCollection("versionSnapshots", items);
  }

  findVersionSnapshot(snapshotId: number) {
    return this.core.readCollection<VersionSnapshot>("versionSnapshots").find((item) => item.id === snapshotId) ?? null;
  }

  listProjectShares(projectId: number) {
    return this.core.readCollection<ProjectShare>("projectShares").filter((item) => item.projectId === projectId);
  }

  findProjectShareByToken(token: string) {
    return this.core.readCollection<ProjectShare>("projectShares").find((item) => item.token === token) ?? null;
  }

  appendProjectShare(share: ProjectShare) {
    const items = this.core.readCollection<ProjectShare>("projectShares");
    items.push(share);
    this.core.writeCollection("projectShares", items);
  }

  listDeployments(projectId?: number) {
    const items = this.core.readCollection<DeploymentRecord>("deployments");
    if (!projectId) {
      return items;
    }
    return items.filter((item) => item.projectId === projectId);
  }

  findDeployment(deploymentId: number) {
    return this.core.readCollection<DeploymentRecord>("deployments").find((item) => item.id === deploymentId) ?? null;
  }

  appendDeployment(record: DeploymentRecord) {
    const items = this.core.readCollection<DeploymentRecord>("deployments");
    items.push(record);
    this.core.writeCollection("deployments", items);
  }

  updateDeployment(record: DeploymentRecord) {
    const items = this.core.readCollection<DeploymentRecord>("deployments");
    const index = items.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      items[index] = record;
      this.core.writeCollection("deployments", items);
    }
  }

  listTemplateRuns(projectId?: number) {
    const runs = this.core.readCollection<TemplateRunRecord>("templateRuns");
    if (!projectId) {
      return runs;
    }
    return runs.filter((item) => item.projectId === projectId);
  }

  appendTemplateRun(record: TemplateRunRecord) {
    const items = this.core.readCollection<TemplateRunRecord>("templateRuns");
    items.push(record);
    this.core.writeCollection("templateRuns", items);
  }

  listProjectPolicies(projectId: number) {
    return this.core.readCollection<ProjectPolicyRecord>("projectPolicies").filter((item) => item.projectId === projectId);
  }

  appendProjectPolicy(record: ProjectPolicyRecord) {
    const items = this.core.readCollection<ProjectPolicyRecord>("projectPolicies");
    items.push(record);
    this.core.writeCollection("projectPolicies", items);
  }

  updateProjectPolicy(record: ProjectPolicyRecord) {
    const items = this.core.readCollection<ProjectPolicyRecord>("projectPolicies");
    const idx = items.findIndex((item) => item.id === record.id && item.projectId === record.projectId);
    if (idx >= 0) {
      items[idx] = record;
      this.core.writeCollection("projectPolicies", items);
    }
  }

  listProjectWorkspaceBindings(projectId: number) {
    return this.core.readCollection<ProjectWorkspaceBindingRecord>("projectWorkspaceBindings").filter((item) => item.projectId === projectId);
  }

  upsertProjectWorkspaceBinding(record: ProjectWorkspaceBindingRecord) {
    const items = this.core.readCollection<ProjectWorkspaceBindingRecord>("projectWorkspaceBindings");
    const idx = items.findIndex((item) => item.id === record.id || item.projectId === record.projectId);
    if (idx >= 0) {
      items[idx] = record;
    } else {
      items.push(record);
    }
    this.core.writeCollection("projectWorkspaceBindings", items);
    return record;
  }

  listPolicyExecutionLogs(iterationId: number) {
    return this.core.readCollection<PolicyExecutionLogRecord>("policyExecutionLogs").filter((item) => item.iterationId === iterationId);
  }

  appendPolicyExecutionLog(record: PolicyExecutionLogRecord) {
    const items = this.core.readCollection<PolicyExecutionLogRecord>("policyExecutionLogs");
    items.push(record);
    this.core.writeCollection("policyExecutionLogs", items);
  }

  listProjectRoleBindings(projectId: number) {
    return this.core.readCollection<ProjectRoleBindingRecord>("projectRoleBindings").filter((item) => item.projectId === projectId);
  }

  upsertProjectRoleBinding(record: ProjectRoleBindingRecord) {
    const items = this.core.readCollection<ProjectRoleBindingRecord>("projectRoleBindings");
    const idx = items.findIndex((item) => item.projectId === record.projectId && item.userId === record.userId);
    if (idx >= 0) {
      items[idx] = record;
    } else {
      items.push(record);
    }
    this.core.writeCollection("projectRoleBindings", items);
    return record;
  }

  removeProjectRoleBinding(projectId: number, userId: string) {
    const items = this.core.readCollection<ProjectRoleBindingRecord>("projectRoleBindings");
    const nextItems = items.filter((item) => !(item.projectId === projectId && item.userId === userId));
    if (nextItems.length === items.length) {
      return false;
    }
    this.core.writeCollection("projectRoleBindings", nextItems);
    return true;
  }

  listTenantMemberBindings(tenantId: string) {
    return this.core.readCollection<TenantMemberBindingRecord>("tenantMemberBindings").filter((item) => item.tenantId === tenantId);
  }

  upsertTenantMemberBinding(record: TenantMemberBindingRecord) {
    const items = this.core.readCollection<TenantMemberBindingRecord>("tenantMemberBindings");
    const idx = items.findIndex((item) => item.tenantId === record.tenantId && item.userId === record.userId);
    if (idx >= 0) {
      items[idx] = record;
    } else {
      items.push(record);
    }
    this.core.writeCollection("tenantMemberBindings", items);
    return record;
  }

  removeTenantMemberBinding(tenantId: string, userId: string) {
    const items = this.core.readCollection<TenantMemberBindingRecord>("tenantMemberBindings");
    const nextItems = items.filter((item) => !(item.tenantId === tenantId && item.userId === userId));
    if (nextItems.length === items.length) {
      return false;
    }
    this.core.writeCollection("tenantMemberBindings", nextItems);
    return true;
  }

  listPlatformRoleBindings() {
    return this.core.readCollection<PlatformRoleBindingRecord>("platformRoleBindings");
  }

  upsertPlatformRoleBinding(record: PlatformRoleBindingRecord) {
    const items = this.core.readCollection<PlatformRoleBindingRecord>("platformRoleBindings");
    const idx = items.findIndex((item) => item.userId === record.userId);
    if (idx >= 0) {
      items[idx] = record;
    } else {
      items.push(record);
    }
    this.core.writeCollection("platformRoleBindings", items);
    return record;
  }

  removePlatformRoleBinding(userId: string) {
    const items = this.core.readCollection<PlatformRoleBindingRecord>("platformRoleBindings");
    const nextItems = items.filter((item) => item.userId !== userId);
    if (nextItems.length === items.length) {
      return false;
    }
    this.core.writeCollection("platformRoleBindings", nextItems);
    return true;
  }

  listGovernanceCustomRoles() {
    return this.core.readCollection<GovernanceCustomRoleRecord>("governanceCustomRoles");
  }

  upsertGovernanceCustomRole(record: GovernanceCustomRoleRecord) {
    const items = this.core.readCollection<GovernanceCustomRoleRecord>("governanceCustomRoles");
    const idx = items.findIndex((item) => item.roleKey === record.roleKey);
    if (idx >= 0) {
      items[idx] = record;
    } else {
      items.push(record);
    }
    this.core.writeCollection("governanceCustomRoles", items);
    return record;
  }

  removeGovernanceCustomRole(roleKey: string) {
    const items = this.core.readCollection<GovernanceCustomRoleRecord>("governanceCustomRoles");
    const nextItems = items.filter((item) => item.roleKey !== roleKey);
    if (nextItems.length === items.length) {
      return false;
    }
    this.core.writeCollection("governanceCustomRoles", nextItems);
    return true;
  }

  updateProject(project: Project) {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.updateProject(project);
      const items = this.core.readCollection<Project>("projects");
      const idx = items.findIndex((item) => item.id === project.id);
      if (idx >= 0) {
        items[idx] = project;
      }
      this.core.writeCollection("projects", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  updateIteration(iteration: Iteration) {
    const db = this.core.db;
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.core.updateIteration(iteration);
      const items = this.core.readCollection<Iteration>("iterations");
      const idx = items.findIndex((item) => item.id === iteration.id);
      if (idx >= 0) {
        items[idx] = iteration;
      }
      this.core.writeCollection("iterations", items);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  // ── AnalysisPipelineRepository ──

  private parseJson<T>(text: string | undefined | null): T | null {
    if (!text) return null;
    try { return JSON.parse(text) as T; } catch { return null; }
  }

  saveAnalysisJob(job: AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }) {
    this.core.db.prepare(`
      INSERT INTO analysis_jobs (job_id, iteration_id, status, created_at, started_at, finished_at, input_summary, progress, warnings, error, result, input, input_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        status = excluded.status, started_at = excluded.started_at, finished_at = excluded.finished_at,
        input_summary = excluded.input_summary, progress = excluded.progress, warnings = excluded.warnings,
        error = excluded.error, result = excluded.result
    `).run(
      job.jobId, job.iterationId, job.status, job.createdAt, job.startedAt, job.finishedAt,
      JSON.stringify(job.inputSummary), JSON.stringify(job.progress), JSON.stringify(job.warnings),
      job.error, job.result ? JSON.stringify(job.result) : null,
      job.input ? JSON.stringify(job.input) : "{}", job.inputFingerprint ?? ""
    );
  }

  findAnalysisJob(jobId: string): (AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }) | null {
    const row = this.core.db.prepare("SELECT * FROM analysis_jobs WHERE job_id = ?").get(jobId) as Record<string, unknown> | undefined;
    return row ? this.rowToAnalysisJob(row) : null;
  }

  listAnalysisJobs(iterationId: number): Array<AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }> {
    const rows = this.core.db.prepare("SELECT * FROM analysis_jobs WHERE iteration_id = ? ORDER BY created_at ASC").all(iterationId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToAnalysisJob(row));
  }

  private rowToAnalysisJob(row: Record<string, unknown>): AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string } {
    return {
      jobId: String(row.job_id ?? ""),
      iterationId: Number(row.iteration_id ?? 0),
      status: String(row.status ?? "queued") as AttachmentAnalysisJob["status"],
      createdAt: String(row.created_at ?? ""),
      startedAt: String(row.started_at ?? ""),
      finishedAt: String(row.finished_at ?? ""),
      inputSummary: this.parseJson(String(row.input_summary ?? "{}")) ?? { fileName: "", sourceType: "single-file" as const, folderName: "", totalFiles: 0, totalBytes: 0 },
      progress: this.parseJson(String(row.progress ?? "{}")) ?? { totalFiles: 0, processedFiles: 0, totalBatches: 0, completedBatches: 0, failedBatches: 0, retriedBatches: 0 },
      warnings: this.parseJson<string[]>(String(row.warnings ?? "[]")) ?? [],
      error: String(row.error ?? ""),
      result: row.result ? this.parseJson(String(row.result)) : null,
      input: this.parseJson(String(row.input ?? "{}")),
      inputFingerprint: String(row.input_fingerprint ?? "")
    };
  }

  saveReportIndex(report: AttachmentReportIndex) {
    this.core.db.prepare(`
      INSERT INTO report_indexes (report_id, analysis_job_id, iteration_id, schema_version, status, analyzed_at, summary, sections)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET
        status = excluded.status, summary = excluded.summary, sections = excluded.sections
    `).run(
      report.reportId, report.analysisJobId, report.iterationId, report.schemaVersion,
      report.status, report.analyzedAt, JSON.stringify(report.summary), JSON.stringify(report.sections)
    );
  }

  findReportIndex(reportId: string): AttachmentReportIndex | null {
    const row = this.core.db.prepare("SELECT * FROM report_indexes WHERE report_id = ?").get(reportId) as Record<string, unknown> | undefined;
    return row ? this.rowToReportIndex(row) : null;
  }

  findReportIndexByJob(jobId: string): AttachmentReportIndex | null {
    const row = this.core.db.prepare("SELECT * FROM report_indexes WHERE analysis_job_id = ?").get(jobId) as Record<string, unknown> | undefined;
    return row ? this.rowToReportIndex(row) : null;
  }

  private rowToReportIndex(row: Record<string, unknown>): AttachmentReportIndex {
    return {
      reportId: String(row.report_id ?? ""),
      analysisJobId: String(row.analysis_job_id ?? ""),
      iterationId: Number(row.iteration_id ?? 0),
      schemaVersion: String(row.schema_version ?? "v1"),
      status: String(row.status ?? "completed") as AttachmentReportIndex["status"],
      analyzedAt: String(row.analyzed_at ?? ""),
      summary: this.parseJson(String(row.summary ?? "{}")) ?? {},
      sections: this.parseJson<AttachmentReportIndex["sections"]>(String(row.sections ?? "[]")) ?? []
    };
  }

  saveReportSections(sections: AttachmentReportSection[]) {
    const stmt = this.core.db.prepare(`
      INSERT INTO report_sections (section_id, report_id, section_key, section_order, status, item_count, updated_at, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(section_id) DO UPDATE SET
        status = excluded.status, item_count = excluded.item_count, updated_at = excluded.updated_at, content = excluded.content
    `);
    for (const s of sections) {
      stmt.run(s.sectionId, s.reportId, s.sectionKey, s.sectionOrder, s.status, s.itemCount, s.updatedAt, JSON.stringify(s.content));
    }
  }

  listReportSections(reportId: string): AttachmentReportSection[] {
    const rows = this.core.db.prepare("SELECT * FROM report_sections WHERE report_id = ? ORDER BY section_order ASC").all(reportId) as Record<string, unknown>[];
    return rows.map((row) => ({
      sectionId: String(row.section_id ?? ""),
      reportId: String(row.report_id ?? ""),
      sectionKey: String(row.section_key ?? "overview") as AttachmentReportSection["sectionKey"],
      sectionOrder: Number(row.section_order ?? 0),
      status: String(row.status ?? "ready") as AttachmentReportSection["status"],
      itemCount: Number(row.item_count ?? 0),
      updatedAt: String(row.updated_at ?? ""),
      content: this.parseJson(String(row.content ?? "{}")) ?? {}
    }));
  }

  saveUpload(upload: AttachmentUploadRecord) {
    this.core.db.prepare(`
      INSERT INTO attachment_uploads (upload_id, iteration_id, source_type, folder_name, idempotency_key, status, total_files, total_bytes, files, created_at, updated_at, error_code, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(upload_id) DO UPDATE SET
        status = excluded.status, total_files = excluded.total_files, total_bytes = excluded.total_bytes,
        files = excluded.files, updated_at = excluded.updated_at, error_code = excluded.error_code, error_message = excluded.error_message
    `).run(
      upload.uploadId, upload.iterationId, upload.sourceType, upload.folderName, upload.idempotencyKey,
      upload.status, upload.totalFiles, upload.totalBytes, JSON.stringify(upload.files),
      upload.createdAt, upload.updatedAt, upload.errorCode, upload.errorMessage
    );
  }

  findUpload(uploadId: string): AttachmentUploadRecord | null {
    const row = this.core.db.prepare("SELECT * FROM attachment_uploads WHERE upload_id = ?").get(uploadId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      uploadId: String(row.upload_id ?? ""),
      iterationId: Number(row.iteration_id ?? 0),
      sourceType: String(row.source_type ?? "single-file") as AttachmentUploadRecord["sourceType"],
      folderName: String(row.folder_name ?? ""),
      idempotencyKey: String(row.idempotency_key ?? ""),
      status: String(row.status ?? "uploading") as AttachmentUploadRecord["status"],
      totalFiles: Number(row.total_files ?? 0),
      totalBytes: Number(row.total_bytes ?? 0),
      files: this.parseJson<AttachmentUploadRecord["files"]>(String(row.files ?? "[]")) ?? [],
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? ""),
      errorCode: String(row.error_code ?? ""),
      errorMessage: String(row.error_message ?? "")
    };
  }

  listUploads(iterationId: number): AttachmentUploadRecord[] {
    const rows = this.core.db.prepare("SELECT * FROM attachment_uploads WHERE iteration_id = ? ORDER BY created_at ASC").all(iterationId) as Record<string, unknown>[];
    return rows.map((row) => this.findUpload(String(row.upload_id))!).filter(Boolean);
  }

  saveIngestJob(job: AttachmentIngestJob) {
    this.core.db.prepare(`
      INSERT INTO attachment_ingest_jobs (ingest_job_id, upload_id, status, total_files, processed_files, created_at, started_at, finished_at, heartbeat_at, error_code, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ingest_job_id) DO UPDATE SET
        status = excluded.status, processed_files = excluded.processed_files,
        started_at = excluded.started_at, finished_at = excluded.finished_at, heartbeat_at = excluded.heartbeat_at,
        error_code = excluded.error_code, error_message = excluded.error_message
    `).run(
      job.ingestJobId, job.uploadId, job.status, job.totalFiles, job.processedFiles,
      job.createdAt, job.startedAt, job.finishedAt, job.heartbeatAt, job.errorCode, job.errorMessage
    );
  }

  findIngestJob(ingestJobId: string): AttachmentIngestJob | null {
    const row = this.core.db.prepare("SELECT * FROM attachment_ingest_jobs WHERE ingest_job_id = ?").get(ingestJobId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ingestJobId: String(row.ingest_job_id ?? ""),
      uploadId: String(row.upload_id ?? ""),
      status: String(row.status ?? "queued") as AttachmentIngestJob["status"],
      totalFiles: Number(row.total_files ?? 0),
      processedFiles: Number(row.processed_files ?? 0),
      createdAt: String(row.created_at ?? ""),
      startedAt: String(row.started_at ?? ""),
      finishedAt: String(row.finished_at ?? ""),
      heartbeatAt: String(row.heartbeat_at ?? ""),
      errorCode: String(row.error_code ?? ""),
      errorMessage: String(row.error_message ?? "")
    };
  }
}
