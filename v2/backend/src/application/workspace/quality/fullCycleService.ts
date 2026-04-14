import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  AttachmentUploadInput,
  AttachmentAnalysisReport,
  IterationChangeBoundary,
  IterationCodeRewriteResponse,
  IterationDeliveryPackageResult,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import type { AgentRunner } from '../shared/agentRunner';
import { runIterationFullCycleOp } from './fullCycleOps';

export type FullCycleDelegates = {
  analyzeAttachment: (iterationId: number, input: AttachmentUploadInput) => Promise<AttachmentAnalysisReport | null>;
  confirmIterationAnalysis: (
    iterationId: number,
    input: {
      accurate: boolean;
      note?: string;
      actor?: string;
      boundary?: Partial<IterationChangeBoundary>;
      resolvedClarificationQuestions?: string[];
    }
  ) => {
    ok: boolean;
    reason?: string;
    unresolvedQuestions?: string[];
    quality?: { score?: number; summary?: string };
  };
  rewriteCodeInBoundary: (
    iterationId: number,
    input: {
      instruction: string;
      dryRun?: boolean;
      maxFiles?: number;
      role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
    }
  ) => Promise<IterationCodeRewriteResponse | null>;
  generateIterationTestArtifacts: (
    iterationId: number,
    input: { dryRun?: boolean }
  ) => Promise<IterationTestArtifactsGenerationResponse | null>;
  getIterationReleaseReview: (iterationId: number) => IterationReleaseReviewResponse | null;
  generateIterationDeliveryPackage: (
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null }
  ) => Promise<IterationDeliveryPackageResult | null>;
  publishIterationToRemote: (
    iterationId: number,
    input: {
      commitMessage?: string;
      openPr?: boolean;
      prTitle?: string;
      prBody?: string;
      dryRun?: boolean;
    }
  ) => Promise<{ ok: boolean; reason?: string; message?: string; blockers?: string[] }>;
};

export class FullCycleService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly delegates: FullCycleDelegates,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  async runIterationFullCycle(iterationId: number, input: IterationFullCycleRunInput): Promise<IterationFullCycleRunResponse | null> {
    return runIterationFullCycleOp({
      repo: this.repo,
      agentRunner: this.agentRunner,
      iterationId,
      input,
      analyzeAttachment: (targetIterationId, analysisInput) => this.delegates.analyzeAttachment(targetIterationId, analysisInput),
      confirmIterationAnalysis: (targetIterationId, confirmInput) => this.delegates.confirmIterationAnalysis(targetIterationId, confirmInput),
      rewriteCodeInBoundary: (targetIterationId, rewriteInput) => this.delegates.rewriteCodeInBoundary(targetIterationId, rewriteInput),
      generateIterationTestArtifacts: (targetIterationId, artifactInput) => this.delegates.generateIterationTestArtifacts(targetIterationId, artifactInput),
      getIterationReleaseReview: (targetIterationId) => this.delegates.getIterationReleaseReview(targetIterationId),
      generateIterationDeliveryPackage: (targetIterationId, deliveryInput) => this.delegates.generateIterationDeliveryPackage(targetIterationId, deliveryInput),
      publishIterationToRemote: (targetIterationId, publishInput) => this.delegates.publishIterationToRemote(targetIterationId, publishInput)
    });
  }
}
