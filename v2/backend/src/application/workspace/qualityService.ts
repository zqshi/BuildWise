import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  IterationReleaseReviewResponse,
  IterationDeliveryPackageResult,
  IterationTestArtifactsGenerationResponse
} from "../../domain/workspace/types";
import type { AgentRunner } from "./agentRunner";
import { executeVisualEditInstructionOp } from "./workspaceServiceVisualEditOps";
import { rewriteCodeInBoundaryOp } from "./workspaceServiceCodeRewriteOps";
import { buildIterationReleaseReviewOp, generateIterationDeliveryPackageOp, generateIterationTestArtifactsOp } from "./workspaceServiceQualityOps";

export class QualityService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null,
    private readonly modelingRepo: ContinuousModelingRepository | null = null
  ) {}

  async generateIterationTestArtifacts(
    iterationId: number,
    input: { dryRun?: boolean } = {}
  ): Promise<IterationTestArtifactsGenerationResponse | null> {
    return generateIterationTestArtifactsOp(this.repo, iterationId, input);
  }

  getIterationReleaseReview(iterationId: number): IterationReleaseReviewResponse | null {
    return buildIterationReleaseReviewOp(this.repo, iterationId);
  }

  async generateIterationDeliveryPackage(
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null } = {}
  ): Promise<IterationDeliveryPackageResult | null> {
    return generateIterationDeliveryPackageOp(this.repo, iterationId, input);
  }

  executeVisualEditInstruction(
    iterationId: number,
    message: string,
    target?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    }
  ) {
    return executeVisualEditInstructionOp(this.agentRunner, this.repo, iterationId, message, target);
  }

  rewriteCodeInBoundary(
    iterationId: number,
    input: {
      instruction: string;
      dryRun?: boolean;
      maxFiles?: number;
      role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
    }
  ) {
    return rewriteCodeInBoundaryOp(this.repo, this.agentRunner, iterationId, input, this.modelingRepo);
  }
}
