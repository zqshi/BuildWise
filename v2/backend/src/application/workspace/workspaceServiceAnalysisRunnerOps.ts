import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { resolveErrorMessage } from "../../shared/utils";
import type {
  AttachmentAnalysisReport,
  AttachmentReportIndex,
  AttachmentReportSection
} from "../../domain/workspace/types";
import type { AgentRunner } from "./agentRunner";
import { analyzeAttachmentOp } from "./workspaceServiceAnalysisOps";
import type { AttachmentAnalysisJobRuntime } from "./workspaceServiceAnalysisQueueOps";
import { defaultIterationChangeControl } from "./workspaceServiceCommon";
import { mergeAttachmentReports, splitAttachmentInputIntoBatches } from "./workspaceServiceAttachmentUtils";

export async function runAttachmentAnalysisJobWithTimeoutOp(params: {
  analysisJobs: Map<string, AttachmentAnalysisJobRuntime>;
  jobId: string;
  analysisJobTimeoutMs: number;
  runAttachmentAnalysisJob: (jobId: string) => Promise<void>;
  onMarkFailed: (iterationId: number, input: AttachmentAnalysisJobRuntime["input"], errorMessage: string, at: string) => void;
}) {
  const { analysisJobs, jobId, analysisJobTimeoutMs, runAttachmentAnalysisJob, onMarkFailed } = params;
  const timeoutMessage = `analysis job timeout (${analysisJobTimeoutMs}ms)`;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), analysisJobTimeoutMs);
  });
  try {
    await Promise.race([runAttachmentAnalysisJob(jobId), timeoutPromise]);
  } catch (error) {
    const job = analysisJobs.get(jobId);
    if (job && (job.status === "queued" || job.status === "running")) {
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : timeoutMessage;
      job.progress.stageHint = "failed:timeout_guard";
      onMarkFailed(job.iterationId, job.input, job.error, job.finishedAt);
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function runAttachmentAnalysisJobOp(params: {
  analysisJobs: Map<string, AttachmentAnalysisJobRuntime>;
  analysisBatchFileLimit: number;
  analysisBatchRetryLimit: number;
  jobId: string;
  repo: WorkspaceRepository;
  agentRunner: AgentRunner | null;
  transitionIteration: (iterationId: number, toStatus: "planned" | "in-progress" | "review" | "blocked" | "completed", input: {
    source: "manual" | "auto";
    reason: string;
    operator: string;
    operatorRole: string;
  }) => { ok: boolean; reason?: string };
  onRecordAttachmentInputFingerprint: (iterationId: number, inputFingerprint: string) => void;
  onMarkFailed: (iterationId: number, input: AttachmentAnalysisJobRuntime["input"], errorMessage: string, at: string) => void;
  reportSectionsByReportId: Map<string, AttachmentReportSection[]>;
  reportIndexesByJobId: Map<string, AttachmentReportIndex>;
  createReportId: () => string;
  buildReportSections: (reportId: string, report: AttachmentAnalysisReport) => AttachmentReportSection[];
  onAnalysisCompleted?: (iterationId: number, report: AttachmentAnalysisReport) => void;
}) {
  const {
    analysisJobs,
    analysisBatchFileLimit,
    analysisBatchRetryLimit,
    jobId,
    repo,
    agentRunner,
    transitionIteration,
    onRecordAttachmentInputFingerprint,
    onMarkFailed,
    reportSectionsByReportId,
    reportIndexesByJobId,
    createReportId,
    buildReportSections,
    onAnalysisCompleted
  } = params;
  const job = analysisJobs.get(jobId);
  if (!job) {
    return;
  }
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.progress.stageHint = "running";
  const batches = splitAttachmentInputIntoBatches(job.input, analysisBatchFileLimit);
  job.progress.totalBatches = batches.length;
  const reports: AttachmentAnalysisReport[] = [];
  const batchFailures: string[] = [];
  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const batchFileCount =
        batch.sourceType === "folder" && Array.isArray(batch.files) && batch.files.length > 0 ? batch.files.length : 1;
      job.progress.currentBatch = batchIndex + 1;
      job.progress.stageHint = `batch:${batchIndex + 1}/${batches.length}`;
      let success = false;
      let lastBatchError = "";
      for (let attempt = 0; attempt <= analysisBatchRetryLimit; attempt += 1) {
        job.progress.currentAttempt = attempt + 1;
        job.progress.stageHint = `batch:${batchIndex + 1}/${batches.length}:attempt:${attempt + 1}`;
        const runnerForJob = agentRunner
          ? ({
              run: async (...args: Parameters<AgentRunner["run"]>) => {
                const [prompt, options] = args;
                job.progress.llmCallCount = (job.progress.llmCallCount || 0) + 1;
                job.progress.llmInFlightCount = Math.max(0, (job.progress.llmInFlightCount || 0) + 1);
                job.progress.lastLlmCallAt = new Date().toISOString();
                job.progress.stageHint = `batch:${batchIndex + 1}/${batches.length}:llm:${prompt.role}:${prompt.agentId}`;
                try {
                  const result = await agentRunner.run(prompt, options);
                  job.progress.llmSuccessCount = (job.progress.llmSuccessCount || 0) + 1;
                  return result;
                } catch (error) {
                  job.progress.llmFailureCount = (job.progress.llmFailureCount || 0) + 1;
                  throw error;
                } finally {
                  job.progress.llmInFlightCount = Math.max(0, (job.progress.llmInFlightCount || 1) - 1);
                }
              }
            } as AgentRunner)
          : null;
        try {
          const report = await analyzeAttachmentOp(repo, runnerForJob, transitionIteration, job.iterationId, batch, {
            onStageChange: (stage) => {
              job.progress.stageHint = `batch:${batchIndex + 1}/${batches.length}:${stage}`;
            }
          });
          if (!report) {
            throw new Error("iteration not found");
          }
          reports.push(report);
          job.progress.completedBatches += 1;
          job.progress.processedFiles += batchFileCount;
          if (attempt > 0) {
            job.progress.retriedBatches += 1;
          }
          job.progress.stageHint = `batch:${batchIndex + 1}/${batches.length}:done`;
          success = true;
          break;
        } catch (error) {
          lastBatchError = resolveErrorMessage(error);
          job.progress.stageHint = `batch:${batchIndex + 1}/${batches.length}:error`;
          if (attempt < analysisBatchRetryLimit) {
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
    onRecordAttachmentInputFingerprint(job.iterationId, job.inputFingerprint);
    job.finishedAt = new Date().toISOString();
    job.status = batchFailures.length > 0 ? "partial_succeeded" : "succeeded";
    job.progress.stageHint = "completed";
    job.progress.currentAttempt = 0;
    job.progress.currentBatch = 0;
    if (job.result) {
      const reportId = createReportId();
      const sections = buildReportSections(reportId, job.result);
      reportSectionsByReportId.set(reportId, sections);
      reportIndexesByJobId.set(job.jobId, {
        reportId,
        analysisJobId: job.jobId,
        iterationId: job.iterationId,
        schemaVersion: "v2",
        status: job.status === "succeeded" ? "completed" : "partial",
        analyzedAt: job.result.analyzedAt || job.finishedAt,
        summary: {
          understanding: job.result.understanding || "",
          projectName: job.result.projectDetection?.projectName || "",
          productName: job.result.projectDetection?.productName || "",
          meaningfulFindings: job.result.meaningfulFindings.length
        },
        sections: sections.map((item) => ({
          sectionId: item.sectionId,
          sectionKey: item.sectionKey,
          status: item.status,
          itemCount: item.itemCount,
          updatedAt: item.updatedAt
        }))
      });
      const iteration = repo.findIteration(job.iterationId);
      if (iteration) {
        iteration.changeControl = {
          ...(iteration.changeControl || defaultIterationChangeControl()),
          lastAttachmentAnalysisJobId: job.jobId,
          lastAttachmentReportId: reportId
        };
        repo.updateIteration(iteration);
      }
      if (onAnalysisCompleted && job.result) {
        try {
          onAnalysisCompleted(job.iterationId, job.result);
        } catch {
          // modeling trigger must not block analysis pipeline
        }
      }
    }
    if (batchFailures.length > 0) {
      job.warnings = [...batchFailures];
    }
  } catch (error) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = error instanceof Error ? error.message : "analysis failed";
    job.progress.stageHint = "failed";
    job.progress.currentAttempt = 0;
    job.progress.currentBatch = 0;
    onMarkFailed(job.iterationId, job.input, job.error, job.finishedAt);
    if (batchFailures.length > 0) {
      job.warnings = [...batchFailures];
    }
  }
}
