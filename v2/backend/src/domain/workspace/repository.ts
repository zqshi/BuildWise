import type {
  AssessmentSnapshot,
  AuditLog,
  CreateIterationInput,
  DeploymentRecord,
  Iteration,
  IterationMessage,
  IterationTransition,
  ProjectShare,
  ProjectPolicyRecord,
  ProjectWorkspaceBindingRecord,
  PolicyExecutionLogRecord,
  PlatformRoleBindingRecord,
  GovernanceCustomRoleRecord,
  ProjectRoleBindingRecord,
  TenantMemberBindingRecord,
  Project,
  TemplateRunRecord,
  VersionSnapshot,
  WorkspaceStore
} from "./types";
import type {
  AttachmentAnalysisJob,
  AttachmentReportIndex,
  AttachmentReportSection,
  AttachmentUploadRecord,
  AttachmentIngestJob
} from "./analysisTypes";
import type { BacklogItem, CreateBacklogItemInput } from "./backlogTypes";
import type { KnowledgeEntry, CreateKnowledgeEntryInput } from "./knowledgeTypes";
import type { KnowledgeGraphCache, KnowledgeGraphData } from "./knowledgeGraphTypes";
import type { ExperiencePolicy, ExperienceExtractionRecord } from "./experiencePolicyTypes";

// ── Sub-interfaces (ISP) ──

interface StoreAccess {
  read(): WorkspaceStore;
  write(data: WorkspaceStore): void;
  nextId(items: { id: number }[]): number;
}

export interface ProjectRepository {
  listProjects(): Project[];
  findProject(projectId: number): Project | null;
  createProject(input: Pick<Project, "name" | "description" | "tenantId" | "ownerUserId">): Project;
  updateProject(project: Project): void;
}

interface IterationRepository {
  listIterations(projectId: number): Iteration[];
  findIteration(iterationId: number): Iteration | null;
  findPreviousIteration(iteration: Iteration): Iteration | null;
  createIteration(projectId: number, payload: CreateIterationInput): Iteration;
  updateIteration(iteration: Iteration): void;
  deleteIteration(iterationId: number): boolean;
  listSnapshots(iterationId: number): AssessmentSnapshot[];
  appendSnapshot(snapshot: AssessmentSnapshot): void;
  listTransitions(iterationId: number): IterationTransition[];
  appendTransition(transition: IterationTransition): void;
}

interface MessageRepository {
  listMessages(iterationId: number, opts?: { limit?: number; offset?: number }): IterationMessage[];
  createMessage(iterationId: number, role: IterationMessage["role"], content: string): IterationMessage;
}

interface GovernanceRepository {
  listAuditLogs(limit?: number): AuditLog[];
  appendAuditLog(log: AuditLog): void;
  listProjectPolicies(projectId: number): ProjectPolicyRecord[];
  appendProjectPolicy(record: ProjectPolicyRecord): void;
  updateProjectPolicy(record: ProjectPolicyRecord): void;
  listPolicyExecutionLogs(iterationId: number): PolicyExecutionLogRecord[];
  appendPolicyExecutionLog(record: PolicyExecutionLogRecord): void;
  listProjectRoleBindings(projectId: number): ProjectRoleBindingRecord[];
  upsertProjectRoleBinding(record: ProjectRoleBindingRecord): ProjectRoleBindingRecord;
  removeProjectRoleBinding(projectId: number, userId: string): boolean;
  listTenantMemberBindings(tenantId: string): TenantMemberBindingRecord[];
  upsertTenantMemberBinding(record: TenantMemberBindingRecord): TenantMemberBindingRecord;
  removeTenantMemberBinding(tenantId: string, userId: string): boolean;
  listPlatformRoleBindings(): PlatformRoleBindingRecord[];
  upsertPlatformRoleBinding(record: PlatformRoleBindingRecord): PlatformRoleBindingRecord;
  removePlatformRoleBinding(userId: string): boolean;
  listGovernanceCustomRoles(): GovernanceCustomRoleRecord[];
  upsertGovernanceCustomRole(record: GovernanceCustomRoleRecord): GovernanceCustomRoleRecord;
  removeGovernanceCustomRole(roleKey: string): boolean;
}

interface CollaborationRepository {
  listVersionSnapshots(projectId: number): VersionSnapshot[];
  appendVersionSnapshot(snapshot: VersionSnapshot): void;
  findVersionSnapshot(snapshotId: number): VersionSnapshot | null;
  listProjectShares(projectId: number): ProjectShare[];
  findProjectShareByToken(token: string): ProjectShare | null;
  appendProjectShare(share: ProjectShare): void;
  listDeployments(projectId?: number): DeploymentRecord[];
  findDeployment(deploymentId: number): DeploymentRecord | null;
  appendDeployment(record: DeploymentRecord): void;
  updateDeployment(record: DeploymentRecord): void;
  listTemplateRuns(projectId?: number): TemplateRunRecord[];
  appendTemplateRun(record: TemplateRunRecord): void;
  listProjectWorkspaceBindings(projectId: number): ProjectWorkspaceBindingRecord[];
  upsertProjectWorkspaceBinding(record: ProjectWorkspaceBindingRecord): ProjectWorkspaceBindingRecord;
}

export interface AnalysisPipelineRepository {
  saveAnalysisJob(job: AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }): void;
  findAnalysisJob(jobId: string): (AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }) | null;
  listAnalysisJobs(iterationId: number): Array<AttachmentAnalysisJob & { input?: unknown; inputFingerprint?: string }>;
  saveReportIndex(report: AttachmentReportIndex): void;
  findReportIndex(reportId: string): AttachmentReportIndex | null;
  findReportIndexByJob(jobId: string): AttachmentReportIndex | null;
  saveReportSections(sections: AttachmentReportSection[]): void;
  listReportSections(reportId: string): AttachmentReportSection[];
  saveUpload(upload: AttachmentUploadRecord): void;
  findUpload(uploadId: string): AttachmentUploadRecord | null;
  listUploads(iterationId: number): AttachmentUploadRecord[];
  saveIngestJob(job: AttachmentIngestJob): void;
  findIngestJob(ingestJobId: string): AttachmentIngestJob | null;
}

export interface BacklogRepository {
  listBacklogItems(projectId: number): BacklogItem[];
  findBacklogItem(itemId: number): BacklogItem | null;
  createBacklogItem(projectId: number, input: CreateBacklogItemInput, createdBy: string): BacklogItem;
  updateBacklogItem(item: BacklogItem): void;
  deleteBacklogItem(itemId: number): boolean;
  listBacklogItemsByIteration(iterationId: number): BacklogItem[];
}

export interface KnowledgeRepository {
  listKnowledgeEntries(projectId: number): KnowledgeEntry[];
  findKnowledgeEntry(entryId: number): KnowledgeEntry | null;
  createKnowledgeEntry(projectId: number, input: CreateKnowledgeEntryInput, createdBy: string): KnowledgeEntry;
  updateKnowledgeEntry(entry: KnowledgeEntry): void;
  deleteKnowledgeEntry(entryId: number): boolean;
  searchKnowledgeEntries(projectId: number, query: string, limit?: number): KnowledgeEntry[];
}

export interface KnowledgeGraphRepository {
  getKnowledgeGraphCache(projectId: number): KnowledgeGraphCache | null;
  saveKnowledgeGraphCache(projectId: number, graphData: KnowledgeGraphData, entryCount: number): KnowledgeGraphCache;
}

export interface ExperienceRepository {
  listExperiencePolicies(projectId: number): ExperiencePolicy[];
  findActiveExperiencePolicy(projectId: number): ExperiencePolicy | null;
  createExperiencePolicy(policy: Omit<ExperiencePolicy, "id">): ExperiencePolicy;
  updateExperiencePolicy(policy: ExperiencePolicy): void;
  deleteExperiencePolicy(policyId: number): boolean;
  listExperienceExtractions(projectId: number): ExperienceExtractionRecord[];
  appendExperienceExtraction(extraction: Omit<ExperienceExtractionRecord, "id">): ExperienceExtractionRecord;
  searchKnowledgeAcrossProjects(tenantId: string, query: string, limit?: number): KnowledgeEntry[];
}

export type AssistantMessage = {
  id: number;
  tenantId: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export interface AssistantConversationRepository {
  listAssistantMessages(tenantId: string, limit?: number): AssistantMessage[];
  appendAssistantMessage(msg: Omit<AssistantMessage, "id">): AssistantMessage;
  clearAssistantMessages(tenantId: string): void;
}

// ── Backward-compatible composite ──

export interface WorkspaceRepository
  extends StoreAccess,
    ProjectRepository,
    IterationRepository,
    MessageRepository,
    GovernanceRepository,
    CollaborationRepository,
    AnalysisPipelineRepository,
    BacklogRepository,
    KnowledgeRepository,
    KnowledgeGraphRepository,
    ExperienceRepository,
    AssistantConversationRepository {}
