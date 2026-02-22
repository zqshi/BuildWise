import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  AssessmentPayload,
  CreateIterationInput,
  IterationReleaseReviewResponse,
  IterationTestArtifactsGenerationResponse,
  IterationCodeLink,
  IterationChangeBoundary,
  Iteration,
  IterationContextPayload,
  IterationStatus
} from "../../domain/workspace/types";
import type { AgentRunner } from "./agentRunner";
import { listAuditLogsOp, listGovernanceRolesOp } from "./workspaceServiceGovernanceOps";
import {
  archiveProjectOp,
  bootstrapProjectRepositoryOp,
  configureProjectRepositoryModeOp,
  createProjectOp,
  getProjectRepositoryStatusOp,
  getProjectRepositoryOp,
  getProjectRepositoryMigrationPlanOp,
  provisionProjectRepositoryOp,
  publishIterationToRemoteOp,
  scaffoldProjectRepositoryOp
} from "./workspaceServiceProjectOps";
import {
  bindIterationCodeLinkOp,
  createIterationOp,
  createMessageOp,
  getAssessmentOp,
  getIterationCodeLinkOp,
  getIterationContextOp,
  getStateMachineOp,
  listAssessmentSnapshotsOp,
  listIterationsOp,
  listMessagesOp,
  locateIterationsByCodeRefOp,
  recomputeAssessmentOp,
  restoreSnapshotOp,
  transitionIterationOp
} from "./workspaceServiceIterationFlowOps";
import {
  confirmIterationAnalysisOp,
  getIterationChangeControlOp,
  updateClarificationDraftOp,
  updateIterationBoundaryOp,
  updateIterationTestMatrixExecutionOp
} from "./workspaceServiceChangeControlOps";
import { analyzeAttachmentOp } from "./workspaceServiceAnalysisOps";
import { coachIterationConversationOp } from "./workspaceServiceCoachOps";
import { executeVisualEditInstructionOp } from "./workspaceServiceVisualEditOps";
import { rewriteCodeInBoundaryOp } from "./workspaceServiceCodeRewriteOps";
import { buildIterationReleaseReviewOp, generateIterationTestArtifactsOp } from "./workspaceServiceQualityOps";
import { hasProject, listProjectsNormalized } from "./workspaceServiceCommon";
import { writeAuditLog } from "./workspaceServiceCommon";

type AttachmentAnalysisJobRuntime = AttachmentAnalysisJob & {
  input: AttachmentUploadInput;
};

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function countInputFiles(input: AttachmentUploadInput) {
  if (input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0) {
    return input.files.length;
  }
  return 1;
}

function summarizeInput(input: AttachmentUploadInput) {
  const totalFiles = countInputFiles(input);
  const totalBytes =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? input.files.reduce((total, item) => total + (Number.isFinite(item.size) ? item.size : 0), 0)
      : Number.isFinite(input.size)
        ? input.size
        : 0;
  return {
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    folderName: input.folderName?.trim() || "",
    totalFiles,
    totalBytes
  } as const;
}

function splitAttachmentInputIntoBatches(input: AttachmentUploadInput, maxBatchFiles: number) {
  if (input.sourceType !== "folder" || !Array.isArray(input.files) || input.files.length <= maxBatchFiles) {
    return [input];
  }
  const files = input.files;
  const batches: AttachmentUploadInput[] = [];
  const totalBatches = Math.ceil(files.length / maxBatchFiles);
  for (let index = 0; index < totalBatches; index += 1) {
    const batchFiles = files.slice(index * maxBatchFiles, (index + 1) * maxBatchFiles);
    const digestBase = (input.excerptDigest || "").trim();
    const digest = digestBase
      ? `${digestBase};batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`
      : `strategy=folder-batch;batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`;
    const batchPreview = batchFiles
      .filter((item) => item.excerpt.trim().length > 0)
      .slice(0, 3)
      .map((item) => `${item.path || item.fileName}: ${item.excerpt.slice(0, 180)}`)
      .join("\n\n");
    batches.push({
      ...input,
      excerpt: (batchPreview || input.excerpt || "").slice(0, 6000),
      excerptDigest: digest,
      excerptStrategy: "folder-batch",
      files: batchFiles
    });
  }
  return batches;
}

function rankProjectConfidence(value: "high" | "medium" | "low") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function mergeAttachmentReports(input: AttachmentUploadInput, reports: AttachmentAnalysisReport[], totalBatches: number): AttachmentAnalysisReport {
  if (reports.length === 1) {
    return reports[0];
  }
  const primary = reports[reports.length - 1];
  const bestProjectDetection = reports.reduce((best, current) => {
    const bestScore = rankProjectConfidence(best.projectDetection.confidence) * 10 + best.projectDetection.evidence.length;
    const currentScore = rankProjectConfidence(current.projectDetection.confidence) * 10 + current.projectDetection.evidence.length;
    return currentScore > bestScore ? current : best;
  }, primary);
  const fileStats =
    input.sourceType === "folder" && Array.isArray(input.files)
      ? {
          totalFiles: input.files.length,
          textFiles: input.files.filter((item) => item.excerpt.trim().length > 0).length,
          binaryFiles: input.files.filter((item) => item.excerpt.trim().length === 0).length
        }
      : primary.fileStats;
  const fileSelection =
    input.sourceType === "folder" && Array.isArray(input.files)
      ? {
          consideredFiles: input.files.length,
          includedFiles: input.files.length,
          skippedNoiseFiles: reports.reduce((total, item) => total + item.fileSelection.skippedNoiseFiles, 0),
          skippedEmptyFiles: reports.reduce((total, item) => total + item.fileSelection.skippedEmptyFiles, 0),
          sampled: reports.some((item) => item.fileSelection.sampled),
          sampleReason: reports.map((item) => item.fileSelection.sampleReason).find(Boolean) || "",
          includedPaths: Array.from(new Set(reports.flatMap((item) => item.fileSelection.includedPaths))).slice(0, 12),
          ignoredFiles: Array.from(
            new Map(
              reports
                .flatMap((item) => item.fileSelection.ignoredFiles)
                .map((item) => [`${item.path}:${item.reason}`, item])
            ).values()
          ).slice(0, 20)
        }
      : primary.fileSelection;
  return {
    ...primary,
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    analyzedTarget: input.sourceType === "folder" ? input.folderName?.trim() || input.fileName : input.fileName,
    analyzedAt: new Date().toISOString(),
    fileStats,
    fileSelection,
    projectDetection: {
      ...bestProjectDetection.projectDetection,
      evidence: Array.from(new Set(reports.flatMap((item) => item.projectDetection.evidence))).slice(0, 6)
    },
    meaningfulFindings: Array.from(new Set(reports.flatMap((item) => item.meaningfulFindings))).slice(0, 16),
    prioritizedFindings: Array.from(
      new Map(reports.flatMap((item) => item.prioritizedFindings).map((item) => [`${item.priority}:${item.content}`, item])).values()
    ).slice(0, 16),
    nextActions: Array.from(new Set(reports.flatMap((item) => item.nextActions))).slice(0, 14),
    clarificationQuestions: Array.from(new Set(reports.flatMap((item) => item.clarificationQuestions))).slice(0, 12),
    suggestions: Array.from(new Set(reports.flatMap((item) => item.suggestions))).slice(0, 14),
    llmContext: {
      ...primary.llmContext,
      strategy: "folder-batch-job",
      digest: `strategy=folder-batch-job;batches=${totalBatches};mergedReports=${reports.length}`,
      excerptLength: reports.reduce((total, item) => total + item.llmContext.excerptLength, 0),
      chunkCount: reports.reduce((total, item) => total + item.llmContext.chunkCount, 0),
      promptContextLength: reports.reduce((total, item) => total + item.llmContext.promptContextLength, 0),
      agentCount: reports.reduce((total, item) => total + item.llmContext.agentCount, 0),
      unknownSignalCount: reports.reduce((total, item) => total + item.llmContext.unknownSignalCount, 0),
      degraded: reports.some((item) => item.llmContext.degraded),
      degradeReason:
        reports
          .map((item) => item.llmContext.degradeReason)
          .filter((item) => item.trim().length > 0)
          .join(" | ")
          .slice(0, 300) || ""
    },
    understanding: `${primary.understanding}（分批汇总：${reports.length}/${totalBatches}）`,
    agentOutputs: reports.flatMap((item) => item.agentOutputs).slice(0, 60)
  };
}

export class WorkspaceService {
  private readonly analysisJobs = new Map<string, AttachmentAnalysisJobRuntime>();

  private readonly analysisQueue: string[] = [];

  private runningAnalysisWorkers = 0;

  private readonly analysisWorkerConcurrency: number;

  private readonly analysisBatchFileLimit: number;

  private readonly analysisBatchRetryLimit: number;

  constructor(
    readonly repo: WorkspaceRepository,
    readonly agentRunner: AgentRunner | null = null
  ) {
    const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    this.analysisWorkerConcurrency = readPositiveInt(processEnv.ANALYSIS_JOB_CONCURRENCY, 2);
    this.analysisBatchFileLimit = readPositiveInt(processEnv.ANALYSIS_JOB_BATCH_FILE_LIMIT, 50);
    this.analysisBatchRetryLimit = readPositiveInt(processEnv.ANALYSIS_JOB_BATCH_RETRY_LIMIT, 2);
  }

  listGovernanceRoles() {
    return listGovernanceRolesOp();
  }

  listAuditLogs(limit = 50) {
    return listAuditLogsOp(this.repo, limit);
  }

  hasProject(projectId: number) {
    return hasProject(this.repo, projectId);
  }

  listProjects() {
    return listProjectsNormalized(this.repo);
  }

  createProject(input: { name: string; description: string }) {
    return createProjectOp(this.repo, input);
  }

  archiveProject(projectId: number) {
    return archiveProjectOp(this.repo, projectId);
  }

  getProjectRepository(projectId: number) {
    return getProjectRepositoryOp(this.repo, projectId);
  }

  bootstrapProjectRepository(
    projectId: number,
    input: Partial<
      Pick<NonNullable<ReturnType<typeof this.getProjectRepository>>, "provider" | "organization" | "name" | "url" | "defaultBranch" | "repoMode"> & {
        requireRemoteForProduction: boolean;
        requireRemoteForStaging: boolean;
      }
    >
  ) {
    return bootstrapProjectRepositoryOp(this.repo, projectId, input);
  }

  configureProjectRepositoryMode(
    projectId: number,
    input: {
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    }
  ) {
    return configureProjectRepositoryModeOp(this.repo, projectId, input);
  }

  getProjectRepositoryStatus(projectId: number) {
    return getProjectRepositoryStatusOp(this.repo, projectId);
  }

  getProjectRepositoryMigrationPlan(projectId: number) {
    return getProjectRepositoryMigrationPlanOp(this.repo, projectId);
  }

  provisionProjectRepository(
    projectId: number,
    input: {
      ownerType?: "org" | "user";
      organization?: string;
      name?: string;
      defaultBranch?: string;
      visibility?: "private" | "public";
      autoInit?: boolean;
      dryRun?: boolean;
    }
  ) {
    return provisionProjectRepositoryOp(this.repo, projectId, input);
  }

  scaffoldProjectRepository(
    projectId: number,
    input: {
      rootDir?: string;
      initializeGit?: boolean;
      createInitialCommit?: boolean;
      dryRun?: boolean;
    }
  ) {
    return scaffoldProjectRepositoryOp(this.repo, projectId, input);
  }

  publishIterationToRemote(
    iterationId: number,
    input: {
      commitMessage?: string;
      openPr?: boolean;
      prTitle?: string;
      prBody?: string;
      dryRun?: boolean;
    }
  ) {
    return publishIterationToRemoteOp(this.repo, iterationId, input);
  }

  listIterations(projectId: number) {
    return listIterationsOp(this.repo, projectId);
  }

  createIteration(projectId: number, payload: CreateIterationInput) {
    return createIterationOp(this.repo, projectId, payload);
  }

  listMessages(iterationId: number) {
    return listMessagesOp(this.repo, iterationId);
  }

  createMessage(iterationId: number, role: "system" | "assistant" | "user", content: string) {
    return createMessageOp(this.repo, iterationId, role, content);
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

  getIterationChangeControl(iterationId: number) {
    return getIterationChangeControlOp(this.repo, iterationId);
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

  locateIterationsByCodeRef(projectId: number, ref: string) {
    return locateIterationsByCodeRefOp(this.repo, projectId, ref);
  }

  getIterationContext(iterationId: number): IterationContextPayload | null {
    return getIterationContextOp(this.repo, iterationId);
  }

  getAssessment(iterationId: number): AssessmentPayload | null {
    return getAssessmentOp(this.repo, iterationId);
  }

  listAssessmentSnapshots(iterationId: number) {
    return listAssessmentSnapshotsOp(this.repo, iterationId);
  }

  getStateMachine(iterationId: number) {
    return getStateMachineOp(this.repo, iterationId);
  }

  transitionIteration(iterationId: number, toStatus: IterationStatus, note = "") {
    return transitionIterationOp(this.repo, iterationId, toStatus, note);
  }

  recomputeAssessment(iterationId: number): AssessmentPayload | null {
    return recomputeAssessmentOp(this.repo, iterationId);
  }

  restoreSnapshot(iterationId: number, snapshotId: number): AssessmentPayload | null {
    return restoreSnapshotOp(this.repo, iterationId, snapshotId);
  }

  analyzeAttachment(iterationId: number, input: AttachmentUploadInput): Promise<AttachmentAnalysisReport | null> {
    return analyzeAttachmentOp(
      this.repo,
      this.agentRunner,
      (targetIterationId, toStatus, note) => this.transitionIteration(targetIterationId, toStatus, note),
      iterationId,
      input
    );
  }

  submitAttachmentAnalysisJob(iterationId: number, input: AttachmentUploadInput): AttachmentAnalysisJob | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const now = new Date().toISOString();
    const jobId = `analysis-${iterationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const summary = summarizeInput(input);
    const runtimeJob: AttachmentAnalysisJobRuntime = {
      jobId,
      iterationId,
      status: "queued",
      createdAt: now,
      startedAt: "",
      finishedAt: "",
      inputSummary: summary,
      progress: {
        totalFiles: summary.totalFiles,
        processedFiles: 0,
        totalBatches: 0,
        completedBatches: 0,
        failedBatches: 0,
        retriedBatches: 0
      },
      warnings: [],
      error: "",
      result: null,
      input
    };
    this.analysisJobs.set(jobId, runtimeJob);
    this.analysisQueue.push(jobId);
    this.triggerAnalysisQueue();
    return this.toPublicAnalysisJob(runtimeJob);
  }

  getAttachmentAnalysisJob(iterationId: number, jobId: string): AttachmentAnalysisJob | null {
    const job = this.analysisJobs.get(jobId);
    if (!job || job.iterationId !== iterationId) {
      return null;
    }
    return this.toPublicAnalysisJob(job);
  }

  private toPublicAnalysisJob(job: AttachmentAnalysisJobRuntime): AttachmentAnalysisJob {
    const { input: _input, ...publicJob } = job;
    return publicJob;
  }

  private triggerAnalysisQueue() {
    while (this.runningAnalysisWorkers < this.analysisWorkerConcurrency && this.analysisQueue.length > 0) {
      const nextJobId = this.analysisQueue.shift();
      if (!nextJobId) {
        return;
      }
      const job = this.analysisJobs.get(nextJobId);
      if (!job || job.status !== "queued") {
        continue;
      }
      this.runningAnalysisWorkers += 1;
      void this.runAttachmentAnalysisJob(nextJobId)
        .catch(() => undefined)
        .finally(() => {
          this.runningAnalysisWorkers = Math.max(0, this.runningAnalysisWorkers - 1);
          this.triggerAnalysisQueue();
        });
    }
  }

  private async runAttachmentAnalysisJob(jobId: string) {
    const job = this.analysisJobs.get(jobId);
    if (!job) {
      return;
    }
    job.status = "running";
    job.startedAt = new Date().toISOString();
    const batches = splitAttachmentInputIntoBatches(job.input, this.analysisBatchFileLimit);
    job.progress.totalBatches = batches.length;
    const reports: AttachmentAnalysisReport[] = [];
    const batchFailures: string[] = [];
    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const batchFileCount =
          batch.sourceType === "folder" && Array.isArray(batch.files) && batch.files.length > 0 ? batch.files.length : 1;
        let success = false;
        let lastBatchError = "";
        for (let attempt = 0; attempt <= this.analysisBatchRetryLimit; attempt += 1) {
          try {
            const report = await analyzeAttachmentOp(
              this.repo,
              this.agentRunner,
              (targetIterationId, toStatus, note) => this.transitionIteration(targetIterationId, toStatus, note),
              job.iterationId,
              batch
            );
            if (!report) {
              throw new Error("iteration not found");
            }
            reports.push(report);
            job.progress.completedBatches += 1;
            job.progress.processedFiles += batchFileCount;
            if (attempt > 0) {
              job.progress.retriedBatches += 1;
            }
            success = true;
            break;
          } catch (error) {
            lastBatchError = error instanceof Error ? error.message : "unknown_error";
            if (attempt < this.analysisBatchRetryLimit) {
              continue;
            }
          }
        }
        if (!success) {
          job.progress.failedBatches += 1;
          batchFailures.push(`batch ${batchIndex + 1}/${batches.length}: ${lastBatchError || "unknown_error"}`);
        }
      }
      if (reports.length === 0) {
        throw new Error(batchFailures[0] || "analysis failed");
      }
      job.result = mergeAttachmentReports(job.input, reports, batches.length);
      job.finishedAt = new Date().toISOString();
      job.status = "succeeded";
      if (batchFailures.length > 0) {
        job.warnings = [...batchFailures];
      }
    } catch (error) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "analysis failed";
      if (batchFailures.length > 0) {
        job.warnings = [...batchFailures];
      }
    }
  }

  coachIterationConversation(iterationId: number, message: string) {
    return coachIterationConversationOp(this.repo, this.agentRunner, iterationId, message);
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
    }
  ) {
    return rewriteCodeInBoundaryOp(this.repo, this.agentRunner, iterationId, input);
  }

  generateIterationTestArtifacts(
    iterationId: number,
    input: { dryRun?: boolean } = {}
  ): IterationTestArtifactsGenerationResponse | null {
    return generateIterationTestArtifactsOp(this.repo, iterationId, input);
  }

  getIterationReleaseReview(iterationId: number): IterationReleaseReviewResponse | null {
    return buildIterationReleaseReviewOp(this.repo, iterationId);
  }

  updateIterationInteractionState(
    iterationId: number,
    input: {
      hasPrototypeAssets: boolean;
      uploadKind?: "documents" | "prototype" | "mixed" | "other";
      lastAttachmentName?: string;
    }
  ): Iteration | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const now = new Date().toISOString();
    const normalized: Iteration = {
      ...iteration,
      interactionState: {
        hasPrototypeAssets: Boolean(input.hasPrototypeAssets),
        uploadKind: input.uploadKind || iteration.interactionState?.uploadKind || "other",
        lastUpdatedAt: now,
        lastAttachmentName: (input.lastAttachmentName || "").trim() || iteration.interactionState?.lastAttachmentName || ""
      }
    };
    this.repo.updateIteration(normalized);
    writeAuditLog(
      this.repo,
      "iteration_interaction_state_updated",
      `iteration:${iterationId}`,
      `hasPrototypeAssets=${normalized.interactionState?.hasPrototypeAssets ? "yes" : "no"};uploadKind=${normalized.interactionState?.uploadKind}`
    );
    return normalized;
  }
}
