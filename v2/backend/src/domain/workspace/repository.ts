import type {
  AssessmentSnapshot,
  AuditLog,
  DeploymentRecord,
  Iteration,
  IterationMessage,
  IterationTransition,
  ProjectShare,
  Project,
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
    payload: Partial<Iteration> & Pick<Iteration, "name" | "description">
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
  appendProjectShare(share: ProjectShare): void;
  listDeployments(projectId?: number): DeploymentRecord[];
  appendDeployment(record: DeploymentRecord): void;
  updateIteration(iteration: Iteration): void;
}
