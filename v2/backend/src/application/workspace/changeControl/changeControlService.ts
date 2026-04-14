import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { IterationChangeBoundary, IterationCodeLink } from '../../../domain/workspace/types';
import {
  confirmIterationAnalysisOp,
  getIterationChangeControlOp,
  updateClarificationDraftOp,
  updateIterationBoundaryOp,
  updateIterationTestMatrixExecutionOp
} from './coreOps';
import {
  confirmIterationArtifactOp,
  commitIterationArtifactOp,
  appendIterationArtifactToConversationOp,
  getIterationArtifactWorkflowOp,
  saveIterationArtifactDraftOp,
  transitionIterationArtifactStageOp
} from './artifactOps';
import {
  bindIterationCodeLinkOp,
  getIterationCodeLinkOp
} from '../iteration/flowOps';

export class ChangeControlService {
  private readonly repo: WorkspaceRepository;
  private _onAnalysisConfirmed: ((iterationId: number, projectId: number) => void) | null = null;

  constructor(repo: WorkspaceRepository) {
    this.repo = repo;
  }

  setOnAnalysisConfirmed(cb: (iterationId: number, projectId: number) => void) {
    this._onAnalysisConfirmed = cb;
  }

  getIterationChangeControl(iterationId: number) {
    return getIterationChangeControlOp(this.repo, iterationId);
  }

  getIterationArtifactWorkflow(iterationId: number) {
    return getIterationArtifactWorkflowOp(this.repo, iterationId);
  }

  saveIterationArtifactDraft(iterationId: number, artifactId: string, input: { content: string; media?: string[]; actor?: string }) {
    return saveIterationArtifactDraftOp(this.repo, iterationId, artifactId, input);
  }

  commitIterationArtifact(
    iterationId: number,
    artifactId: string,
    input: { actor?: string; summary?: string; evidence?: string[]; source?: string }
  ) {
    return commitIterationArtifactOp(this.repo, iterationId, artifactId, input);
  }

  confirmIterationArtifact(iterationId: number, artifactId: string, input: { actor?: string; passed?: boolean; note?: string }) {
    return confirmIterationArtifactOp(this.repo, iterationId, artifactId, input);
  }

  appendIterationArtifactToConversation(iterationId: number, artifactId: string, input: { actor?: string; prompt?: string }) {
    return appendIterationArtifactToConversationOp(this.repo, iterationId, artifactId, input);
  }

  transitionIterationArtifactStage(
    iterationId: number,
    toStage: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive",
    input: { actor?: string; note?: string }
  ) {
    return transitionIterationArtifactStageOp(this.repo, iterationId, toStage, input);
  }

  confirmIterationAnalysis(
    iterationId: number,
    input: {
      accurate: boolean;
      note?: string;
      actor?: string;
      force?: boolean;
      boundary?: Partial<IterationChangeBoundary>;
      resolvedClarificationQuestions?: string[];
    }
  ) {
    const result = confirmIterationAnalysisOp(this.repo, iterationId, input);
    if (result?.ok && this._onAnalysisConfirmed) {
      const iteration = this.repo.findIteration(iterationId);
      if (iteration) this._onAnalysisConfirmed(iterationId, iteration.projectId);
    }
    return result;
  }

  updateIterationBoundary(iterationId: number, input: Partial<IterationChangeBoundary>) {
    return updateIterationBoundaryOp(this.repo, iterationId, input);
  }

  updateClarificationDraft(iterationId: number, resolvedQuestions: string[]) {
    return updateClarificationDraftOp(this.repo, iterationId, resolvedQuestions);
  }

  updateIterationTestMatrixExecution(
    iterationId: number,
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) {
    return updateIterationTestMatrixExecutionOp(this.repo, iterationId, updates);
  }

  bindIterationCodeLink(
    iterationId: number,
    input: Partial<Pick<IterationCodeLink, "branch" | "tag" | "commit" | "pr" | "paths" | "note">>
  ) {
    return bindIterationCodeLinkOp(this.repo, iterationId, input);
  }

  getIterationCodeLink(iterationId: number) {
    return getIterationCodeLinkOp(this.repo, iterationId);
  }
}
