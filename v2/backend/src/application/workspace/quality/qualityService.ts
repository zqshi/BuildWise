import type { ContinuousModelingRepository } from '../../../domain/continuousModeling/repository';
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type {
  IterationReleaseReviewResponse,
  IterationDeliveryPackageResult,
  IterationTestArtifactsGenerationResponse
} from '../../../domain/workspace/types';
import type { AgentRunner } from '../shared/agentRunner';
import { normalizeIteration, normalizeProject } from '../shared/workspaceSupport';
import { executeVisualEditInstructionOp } from './visualEditOps';
import {
  rewriteCodeInBoundaryOp,
  executeCodeRewriteViaAgent,
  realCodeRewriteGitOps,
  type CodeRewriteAgentContext,
} from './codeRewriteOps';
import {
  createCodeRewriteJob,
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  getCodeRewriteJob,
  type CodeRewriteJobStore,
  type CodeRewriteEdit,
} from './codeRewriteJobOps';
import { mergeCodeRewriteIntoOntology } from '../project/ontologyCodeRewriteBridge';
import { buildIterationReleaseReviewOp, generateIterationDeliveryPackageOp, generateIterationTestArtifactsOp } from './qualityOps';
import type { AgentRegistry } from '../../../infrastructure/agent/agentRegistry';

export class QualityService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null,
    private readonly modelingRepo: ContinuousModelingRepository | null = null,
    private readonly codingAgentRegistry: AgentRegistry | null = null,
    private readonly codeRewriteJobStore: CodeRewriteJobStore | null = null
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

  /**
   * 异步启动编码 agent 改写 job。有 codingAgentRegistry 时走编码 agent 路径，
   * 返回 jobId 供轮询；无 registry 返回 null（调用方应回退到同步 rewriteCodeInBoundary）。
   */
  startCodeRewriteJob(
    iterationId: number,
    input: {
      instruction: string;
      maxFiles?: number;
      role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
    }
  ): string | null {
    if (!this.codingAgentRegistry || !this.codeRewriteJobStore) return null;
    const context = this.resolveAgentContext(iterationId, input);
    if (!context) return null;
    const jobId = `cr-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const now = new Date().toISOString();
    createCodeRewriteJob(this.codeRewriteJobStore, {
      jobId, iterationId, instruction: context.instruction,
      repoPath: context.repoPath, boundaryCodePaths: context.boundaryCodePaths, role: context.role, now,
    });
    // fire-and-forget 执行器，完成后更新 job 状态 + 回流本体
    void this.runAgentJob(jobId, iterationId, context);
    return jobId;
  }

  getCodeRewriteJob(jobId: string) {
    if (!this.codeRewriteJobStore) return null;
    return getCodeRewriteJob(this.codeRewriteJobStore, jobId);
  }

  private resolveAgentContext(
    iterationId: number,
    input: { instruction: string; maxFiles?: number; role?: "delivery-engineer" | "frontend-developer" | "backend-developer" }
  ): CodeRewriteAgentContext | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) return null;
    const normalized = normalizeIteration(iteration);
    const project = this.repo.findProject(normalized.projectId);
    if (!project) return null;
    const repoPath = normalizeProject(project).repository?.workspace?.repoPath || "";
    const boundaryCodePaths = normalized.changeControl?.boundary?.codePaths ?? [];
    if (!repoPath || boundaryCodePaths.length === 0) return null;
    return {
      repoPath,
      boundaryCodePaths,
      instruction: input.instruction,
      role: input.role,
      maxFiles: input.maxFiles,
    };
  }

  private async runAgentJob(jobId: string, iterationId: number, context: CodeRewriteAgentContext): Promise<void> {
    if (!this.codingAgentRegistry || !this.codeRewriteJobStore) return;
    const now = new Date().toISOString();
    try {
      markJobRunning(this.codeRewriteJobStore, jobId, { sessionId: "pending", startedAt: now });
      const result = await executeCodeRewriteViaAgent({
        registry: this.codingAgentRegistry,
        gitOps: realCodeRewriteGitOps,
        context,
      });
      markJobCompleted(this.codeRewriteJobStore, jobId, {
        finishedAt: new Date().toISOString(),
        edits: result.edits,
        boundaryViolations: result.violations,
      });
      // V4 本体回流：编码 agent 改动合并进 KB.codeMap，让本体随真实代码演进
      this.syncCodeRewriteIntoOntology(iterationId, result.edits);
    } catch (error) {
      markJobFailed(this.codeRewriteJobStore, jobId, {
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private syncCodeRewriteIntoOntology(iterationId: number, edits: CodeRewriteEdit[]): void {
    if (edits.length === 0) return;
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) return;
    const normalized = normalizeIteration(iteration);
    const project = this.repo.findProject(normalized.projectId);
    if (!project || !project.knowledgeBase) return;
    const ontologyResult = mergeCodeRewriteIntoOntology(project.knowledgeBase, edits);
    if (ontologyResult.mergedPaths.length === 0) return;
    this.repo.updateProject({ ...project, knowledgeBase: ontologyResult.updatedKb });
  }
}
