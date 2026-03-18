import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { IterationChangeBoundary, IterationCodeLink } from "../../domain/workspace/types";
import {
  confirmIterationAnalysisOp,
  confirmIterationArtifactOp,
  commitIterationArtifactOp,
  appendIterationArtifactToConversationOp,
  getIterationArtifactWorkflowOp,
  getIterationChangeControlOp,
  saveIterationArtifactDraftOp,
  transitionIterationArtifactStageOp,
  updateClarificationDraftOp,
  updateIterationBoundaryOp,
  updateIterationTestMatrixExecutionOp
} from "./workspaceServiceChangeControlOps";
import {
  bindIterationCodeLinkOp,
  getIterationCodeLinkOp
} from "./workspaceServiceIterationFlowOps";

export class ChangeControlService {
  private readonly repo: WorkspaceRepository;
  constructor(repo: WorkspaceRepository) {
    this.repo = repo;
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
      boundary?: Partial<IterationChangeBoundary>;
      resolvedClarificationQuestions?: string[];
    }
  ) {
    return confirmIterationAnalysisOp(this.repo, iterationId, input);
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
