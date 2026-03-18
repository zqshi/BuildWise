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
  Project,
  TemplateRunRecord,
  VersionSnapshot,
  WorkspaceStore
} from "./types";

// ── Sub-interfaces (ISP) ──

export interface StoreAccess {
  read(): WorkspaceStore;
  write(data: WorkspaceStore): void;
  nextId(items: { id: number }[]): number;
}

export interface ProjectRepository {
  listProjects(): Project[];
  findProject(projectId: number): Project | null;
  createProject(input: Pick<Project, "name" | "description">): Project;
  updateProject(project: Project): void;
}

export interface IterationRepository {
  listIterations(projectId: number): Iteration[];
  findIteration(iterationId: number): Iteration | null;
  findPreviousIteration(iteration: Iteration): Iteration | null;
  createIteration(projectId: number, payload: CreateIterationInput): Iteration;
  updateIteration(iteration: Iteration): void;
  listSnapshots(iterationId: number): AssessmentSnapshot[];
  appendSnapshot(snapshot: AssessmentSnapshot): void;
  listTransitions(iterationId: number): IterationTransition[];
  appendTransition(transition: IterationTransition): void;
}

export interface MessageRepository {
  listMessages(iterationId: number): IterationMessage[];
  createMessage(iterationId: number, role: IterationMessage["role"], content: string): IterationMessage;
}

export interface GovernanceRepository {
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
  listPlatformRoleBindings(): PlatformRoleBindingRecord[];
  upsertPlatformRoleBinding(record: PlatformRoleBindingRecord): PlatformRoleBindingRecord;
  removePlatformRoleBinding(userId: string): boolean;
  listGovernanceCustomRoles(): GovernanceCustomRoleRecord[];
  upsertGovernanceCustomRole(record: GovernanceCustomRoleRecord): GovernanceCustomRoleRecord;
  removeGovernanceCustomRole(roleKey: string): boolean;
}

export interface CollaborationRepository {
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

// ── Backward-compatible composite ──

export interface WorkspaceRepository
  extends StoreAccess,
    ProjectRepository,
    IterationRepository,
    MessageRepository,
    GovernanceRepository,
    CollaborationRepository {}
