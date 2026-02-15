import type {
  AssessmentSnapshot,
  AuditLog,
  Iteration,
  IterationMessage,
  IterationTransition,
  Project,
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
  updateIteration(iteration: Iteration): void;
}
