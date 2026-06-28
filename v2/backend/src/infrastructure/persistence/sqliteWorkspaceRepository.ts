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
import { SqliteWorkspaceAnalysisStore } from "./sqliteWorkspaceAnalysisStore";
import { SqliteWorkspaceBacklog } from "./sqliteWorkspaceBacklog";
import { SqliteWorkspaceKnowledge } from "./sqliteWorkspaceKnowledge";
import { SqliteWorkspaceExperience } from "./sqliteWorkspaceExperience";
import { SqliteWorkspaceAssistantConversation } from "./sqliteWorkspaceAssistantConversation";
import type { ExperiencePolicy, ExperienceExtractionRecord } from "../../domain/workspace/experiencePolicyTypes";
import type { AssistantMessage } from "../../domain/workspace/repository";

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private readonly core: SqliteWorkspaceCore;
  private readonly analysisStore: SqliteWorkspaceAnalysisStore;
  private readonly backlogStore: SqliteWorkspaceBacklog;
  private readonly knowledgeStore: SqliteWorkspaceKnowledge;
  private readonly experienceStore: SqliteWorkspaceExperience;
  private readonly assistantConversationStore: SqliteWorkspaceAssistantConversation;

  constructor(dbFile: string, seedDataFile?: string, options?: { bootstrapMode?: "seed" | "empty" }) {
    this.core = new SqliteWorkspaceCore(dbFile, seedDataFile, options);
    this.core.readStore();
    this.analysisStore = new SqliteWorkspaceAnalysisStore(this.core.db);
    this.backlogStore = new SqliteWorkspaceBacklog(this.core.db);
    this.knowledgeStore = new SqliteWorkspaceKnowledge(this.core.db);
    this.experienceStore = new SqliteWorkspaceExperience(this.core.db);
    this.assistantConversationStore = new SqliteWorkspaceAssistantConversation(this.core.db);
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

  listProjects(tenantId?: string) {
    return this.core.listProjects(tenantId);
  }

  findProject(projectId: number, tenantId?: string) {
    return this.core.findProject(projectId, tenantId);
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

  // ── AnalysisPipelineRepository (delegated to SqliteWorkspaceAnalysisStore) ──

  saveAnalysisJob(job: AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }) { this.analysisStore.saveAnalysisJob(job); }
  findAnalysisJob(jobId: string) { return this.analysisStore.findAnalysisJob(jobId); }
  listAnalysisJobs(iterationId: number) { return this.analysisStore.listAnalysisJobs(iterationId); }
  saveReportIndex(report: AttachmentReportIndex) { this.analysisStore.saveReportIndex(report); }
  findReportIndex(reportId: string) { return this.analysisStore.findReportIndex(reportId); }
  findReportIndexByJob(jobId: string) { return this.analysisStore.findReportIndexByJob(jobId); }
  saveReportSections(sections: AttachmentReportSection[]) { this.analysisStore.saveReportSections(sections); }
  listReportSections(reportId: string) { return this.analysisStore.listReportSections(reportId); }
  saveUpload(upload: AttachmentUploadRecord) { this.analysisStore.saveUpload(upload); }
  findUpload(uploadId: string) { return this.analysisStore.findUpload(uploadId); }
  listUploads(iterationId: number) { return this.analysisStore.listUploads(iterationId); }
  saveIngestJob(job: AttachmentIngestJob) { this.analysisStore.saveIngestJob(job); }
  findIngestJob(ingestJobId: string) { return this.analysisStore.findIngestJob(ingestJobId); }

  // ── BacklogRepository (delegated to SqliteWorkspaceBacklog) ──

  listBacklogItems(projectId: number) { return this.backlogStore.listBacklogItems(projectId); }
  findBacklogItem(itemId: number) { return this.backlogStore.findBacklogItem(itemId); }
  createBacklogItem(projectId: number, input: Parameters<typeof this.backlogStore.createBacklogItem>[1], createdBy: string) { return this.backlogStore.createBacklogItem(projectId, input, createdBy); }
  updateBacklogItem(item: Parameters<typeof this.backlogStore.updateBacklogItem>[0]) { this.backlogStore.updateBacklogItem(item); }
  deleteBacklogItem(itemId: number) { return this.backlogStore.deleteBacklogItem(itemId); }
  listBacklogItemsByIteration(iterationId: number) { return this.backlogStore.listBacklogItemsByIteration(iterationId); }

  // ── KnowledgeRepository (delegated to SqliteWorkspaceKnowledge) ──

  listKnowledgeEntries(projectId: number) { return this.knowledgeStore.listKnowledgeEntries(projectId); }
  findKnowledgeEntry(entryId: number) { return this.knowledgeStore.findKnowledgeEntry(entryId); }
  createKnowledgeEntry(projectId: number, input: Parameters<typeof this.knowledgeStore.createKnowledgeEntry>[1], createdBy: string) { return this.knowledgeStore.createKnowledgeEntry(projectId, input, createdBy); }
  updateKnowledgeEntry(entry: Parameters<typeof this.knowledgeStore.updateKnowledgeEntry>[0]) { this.knowledgeStore.updateKnowledgeEntry(entry); }
  deleteKnowledgeEntry(entryId: number) { return this.knowledgeStore.deleteKnowledgeEntry(entryId); }
  searchKnowledgeEntries(projectId: number, query: string, limit?: number) { return this.knowledgeStore.searchKnowledgeEntries(projectId, query, limit); }

  // ── KnowledgeGraphRepository (delegated to SqliteWorkspaceCore) ──

  getKnowledgeGraphCache(projectId: number) { return this.core.getKnowledgeGraphCache(projectId); }
  saveKnowledgeGraphCache(projectId: number, graphData: Parameters<typeof this.core.saveKnowledgeGraphCache>[1], entryCount: number) { return this.core.saveKnowledgeGraphCache(projectId, graphData, entryCount); }

  // ── ExperienceRepository (delegated to SqliteWorkspaceExperience) ──

  listExperiencePolicies(projectId: number) { return this.experienceStore.listExperiencePolicies(projectId); }
  findActiveExperiencePolicy(projectId: number) { return this.experienceStore.findActiveExperiencePolicy(projectId); }
  createExperiencePolicy(policy: Omit<ExperiencePolicy, "id">) { return this.experienceStore.createExperiencePolicy(policy); }
  updateExperiencePolicy(policy: ExperiencePolicy) { this.experienceStore.updateExperiencePolicy(policy); }
  deleteExperiencePolicy(policyId: number) { return this.experienceStore.deleteExperiencePolicy(policyId); }
  listExperienceExtractions(projectId: number) { return this.experienceStore.listExperienceExtractions(projectId); }
  appendExperienceExtraction(extraction: Omit<ExperienceExtractionRecord, "id">) { return this.experienceStore.appendExperienceExtraction(extraction); }
  searchKnowledgeAcrossProjects(tenantId: string, query: string, limit?: number) { return this.experienceStore.searchKnowledgeAcrossProjects(tenantId, query, limit); }

  // ── Assistant Conversation ──
  listAssistantMessages(tenantId: string, limit?: number) { return this.assistantConversationStore.listAssistantMessages(tenantId, limit); }
  appendAssistantMessage(msg: Omit<AssistantMessage, "id">) { return this.assistantConversationStore.appendAssistantMessage(msg); }
  clearAssistantMessages(tenantId: string) { this.assistantConversationStore.clearAssistantMessages(tenantId); }
}
