import type {
  AssessmentSnapshot,
  AuditLog,
  CreateIterationInput,
  DeploymentRecord,
  Iteration,
  IterationMessage,
  IterationTransition,
  ProjectShare,
  Project,
  TemplateRunRecord,
  VersionSnapshot,
  WorkspaceStore
} from "./types";

export interface WorkspaceRepository {
  read(): WorkspaceStore;
  write(data: WorkspaceStore): void;
  nextId(items: { id: number }[]): number;
  listProjects(): Project[];
  findProject(projectId: number): Project | null;
  createProject(input: Pick<Project, "name" | "description">): Project;
  listIterations(projectId: number): Iteration[];
  findIteration(iterationId: number): Iteration | null;
  findPreviousIteration(iteration: Iteration): Iteration | null;
  createIteration(
    projectId: number,
    payload: CreateIterationInput
  ): Iteration;
  listMessages(iterationId: number): IterationMessage[];
  createMessage(iterationId: number, role: IterationMessage["role"], content: string): IterationMessage;
  listSnapshots(iterationId: number): AssessmentSnapshot[];
  listTransitions(iterationId: number): IterationTransition[];
  appendSnapshot(snapshot: AssessmentSnapshot): void;
  appendTransition(transition: IterationTransition): void;
  listAuditLogs(limit?: number): AuditLog[];
  appendAuditLog(log: AuditLog): void;
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
  updateProject(project: Project): void;
  updateIteration(iteration: Iteration): void;
}
