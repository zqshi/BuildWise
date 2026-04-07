import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  AttachmentReportIndex,
  AttachmentReportSection,
  IterationStatus,
  IterationTransitionSource
} from "../../domain/workspace/types";
import type { AgentRunner } from "./agentRunner";
import { analyzeAttachmentOp } from "./workspaceServiceAnalysisOps";
import { buildAttachmentReportSections, getAttachmentReportSectionPage } from "./attachmentOps";
import {
  createQueuedAnalysisJobOp,
  reconcileAnalysisJobsOp,
  triggerAnalysisQueueOp,
  type AttachmentAnalysisJobRuntime,
  runAttachmentAnalysisJobOp,
  runAttachmentAnalysisJobWithTimeoutOp,
  findPendingDuplicateJobOp,
  hasPendingDuplicateJobOp,
  isDuplicateAttachmentUploadOp,
  markFailedAnalysisOp,
  persistRetryableAnalysisInputOp,
  recordAttachmentInputFingerprintOp
} from "./analysisInputOps";
import { readNonNegativeInt, readPositiveInt, readPositiveMs } from "./workspaceEnvParsers";
import {
  buildAttachmentInputFingerprint,
  nowIso,
  parseAttachmentInputSnapshot,
  shortId,
  summarizeInput
} from "./attachmentOps";
import { defaultIterationChangeControl } from "./workspaceServiceCommon";
import { DuplicateAttachmentUploadError } from "./workspaceErrors";

export type AnalysisCompletedCallback = (iterationId: number, report: AttachmentAnalysisReport) => void;

export class AnalysisService {
  readonly analysisJobs = new Map<string, AttachmentAnalysisJobRuntime>();

  private readonly analysisQueue: string[] = [];

  private readonly reportIndexesByJobId = new Map<string, AttachmentReportIndex>();

  private readonly reportSectionsByReportId = new Map<string, AttachmentReportSection[]>();

  get reportIndexes(): ReadonlyMap<string, AttachmentReportIndex> {
    return this.reportIndexesByJobId;
  }

  private runningAnalysisWorkers = 0;

  private readonly analysisWorkerConcurrency: number;

  private readonly analysisBatchFileLimit: number;

  private readonly analysisBatchRetryLimit: number;

  private readonly analysisJobTimeoutMs: number;

  private readonly analysisQueuedStallTimeoutMs: number;

  private readonly transitionIteration: (
    iterationId: number,
    toStatus: IterationStatus,
    input: { source: IterationTransitionSource; reason: string; operator: string; operatorRole: string }
  ) => { ok: boolean; reason?: string };

  private onAnalysisCompletedCallback: AnalysisCompletedCallback | null = null;

  setOnAnalysisCompleted(callback: AnalysisCompletedCallback) {
    this.onAnalysisCompletedCallback = callback;
  }

  constructor(
    private readonly repo: WorkspaceRepository,
    transitionIteration: (
      iterationId: number,
      toStatus: IterationStatus,
      input: { source: IterationTransitionSource; reason: string; operator: string; operatorRole: string }
    ) => { ok: boolean; reason?: string },
    private readonly agentRunner: AgentRunner | null = null
  ) {
    const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    this.analysisWorkerConcurrency = readPositiveInt(processEnv.ANALYSIS_JOB_CONCURRENCY, 2);
    this.analysisBatchFileLimit = readPositiveInt(processEnv.ANALYSIS_JOB_BATCH_FILE_LIMIT, 50);
    this.analysisBatchRetryLimit = readNonNegativeInt(processEnv.ANALYSIS_JOB_BATCH_RETRY_LIMIT, 2);
    this.analysisJobTimeoutMs = readPositiveMs(processEnv.ANALYSIS_JOB_TIMEOUT_MS, 25 * 60 * 1000);
    this.analysisQueuedStallTimeoutMs = readPositiveMs(processEnv.ANALYSIS_JOB_QUEUED_STALL_TIMEOUT_MS, 10 * 60 * 1000);
    this.transitionIteration = transitionIteration;
    this.restoreFromDb();
  }

  private restoreFromDb() {
    try {
      const allJobs = this.repo.listAnalysisJobs
        ? (() => {
            const jobs: Array<AttachmentAnalysisJobRuntime> = [];
            for (const project of this.repo.listProjects()) {
              for (const iter of this.repo.listIterations(project.id)) {
                for (const row of this.repo.listAnalysisJobs(iter.id)) {
                  jobs.push({
                    ...row,
                    input: (row.input ?? {}) as AttachmentUploadInput,
                    inputFingerprint: row.inputFingerprint ?? ""
                  } as AttachmentAnalysisJobRuntime);
                }
              }
            }
            return jobs;
          })()
        : [];
      for (const job of allJobs) {
        if (!this.analysisJobs.has(job.jobId)) {
          this.analysisJobs.set(job.jobId, job);
        }
        const reportIndex = this.repo.findReportIndexByJob?.(job.jobId);
        if (reportIndex && !this.reportIndexesByJobId.has(job.jobId)) {
          this.reportIndexesByJobId.set(job.jobId, reportIndex);
          const sections = this.repo.listReportSections?.(reportIndex.reportId) ?? [];
          if (sections.length > 0 && !this.reportSectionsByReportId.has(reportIndex.reportId)) {
            this.reportSectionsByReportId.set(reportIndex.reportId, sections);
          }
        }
      }
    } catch (err) {
      console.error("[AnalysisService] Failed to restore from DB, starting fresh", err);
    }
  }

  private persistJob(job: AttachmentAnalysisJobRuntime) {
    try {
      this.repo.saveAnalysisJob?.({
        ...job,
        input: job.input,
        inputFingerprint: job.inputFingerprint
      });
    } catch (err) {
      console.error("[AnalysisService] Failed to persist job", job.jobId, err);
    }
  }

  private persistReportIndex(report: AttachmentReportIndex) {
    try {
      this.repo.saveReportIndex?.(report);
    } catch (err) {
      console.error("[AnalysisService] Failed to persist report index", report.reportId, err);
    }
  }

  private persistReportSections(sections: AttachmentReportSection[]) {
    try {
      this.repo.saveReportSections?.(sections);
    } catch (err) {
      console.error("[AnalysisService] Failed to persist report sections", err);
    }
  }

  analyzeAttachment(iterationId: number, input: AttachmentUploadInput): Promise<AttachmentAnalysisReport | null> {
    const inputFingerprint = buildAttachmentInputFingerprint(input);
    if (this.isDuplicateAttachmentUpload(iterationId, inputFingerprint)) {
      throw new DuplicateAttachmentUploadError("duplicate_upload");
    }
    this.persistRetryableAnalysisInput(iterationId, input);
    return analyzeAttachmentOp(
      this.repo,
      this.agentRunner,
      (targetIterationId, toStatus, transitionInput) => this.transitionIteration(targetIterationId, toStatus, transitionInput),
      iterationId,
      input
    ).then((report) => {
      if (report) {
        this.recordAttachmentInputFingerprint(iterationId, inputFingerprint);
        this.fireAnalysisCompleted(iterationId, report);
      }
      return report;
    });
  }

  submitAttachmentAnalysisJob(iterationId: number, input: AttachmentUploadInput): AttachmentAnalysisJob | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const inputFingerprint = buildAttachmentInputFingerprint(input);
    if (this.isDuplicateAttachmentUpload(iterationId, inputFingerprint) || this.hasPendingDuplicateJob(iterationId, inputFingerprint)) {
      throw new DuplicateAttachmentUploadError("duplicate_upload");
    }
    this.persistRetryableAnalysisInput(iterationId, input);
    return this.enqueueAttachmentAnalysisJob(iterationId, input, inputFingerprint);
  }

  retryLatestFailedAttachmentAnalysisJob(iterationId: number): AttachmentAnalysisJob | null {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const latestFailedJob = Array.from(this.analysisJobs.values())
      .filter((job) => job.iterationId === iterationId && job.status === "failed")
      .sort((a, b) => {
        const at = new Date(a.finishedAt || a.createdAt).getTime();
        const bt = new Date(b.finishedAt || b.createdAt).getTime();
        return bt - at;
      })[0];
    const latestAnyJob = Array.from(this.analysisJobs.values())
      .filter((job) => job.iterationId === iterationId)
      .sort((a, b) => {
        const at = new Date(a.finishedAt || a.createdAt).getTime();
        const bt = new Date(b.finishedAt || b.createdAt).getTime();
        return bt - at;
      })[0];
    const persistedInput =
      parseAttachmentInputSnapshot(iteration.changeControl?.lastFailedAnalysisInput || "") ||
      (latestFailedJob ? latestFailedJob.input : null) ||
      (latestAnyJob ? latestAnyJob.input : null);
    if (!persistedInput) {
      return null;
    }
    const persistedFingerprint = buildAttachmentInputFingerprint(persistedInput);
    const pending = this.findPendingDuplicateJob(iterationId, persistedFingerprint);
    if (pending) {
      return this.toPublicAnalysisJob(pending);
    }
    return this.enqueueAttachmentAnalysisJob(iterationId, persistedInput, persistedFingerprint);
  }

  retryAttachmentAnalysisJob(iterationId: number, options?: { jobId?: string; scope?: "job" | "batch" }): AttachmentAnalysisJob | null {
    const scope = options?.scope === "batch" ? "batch" : "job";
    if (scope === "batch") {
      return this.retryLatestFailedAttachmentAnalysisJob(iterationId);
    }
    if (options?.jobId) {
      const sourceJob = this.analysisJobs.get(options.jobId);
      if (!sourceJob || sourceJob.iterationId !== iterationId) {
        return null;
      }
      const fingerprint = buildAttachmentInputFingerprint(sourceJob.input);
      const pending = this.findPendingDuplicateJob(iterationId, fingerprint);
      if (pending) {
        return this.toPublicAnalysisJob(pending);
      }
      return this.enqueueAttachmentAnalysisJob(iterationId, sourceJob.input, fingerprint);
    }
    return this.retryLatestFailedAttachmentAnalysisJob(iterationId);
  }

  getAttachmentAnalysisJob(iterationId: number, jobId: string): AttachmentAnalysisJob | null {
    this.reconcileAnalysisJobs();
    const job = this.analysisJobs.get(jobId);
    if (!job || job.iterationId !== iterationId) {
      return null;
    }
    return this.toPublicAnalysisJob(job);
  }

  getAttachmentReportIndexByJob(iterationId: number, jobId: string): AttachmentReportIndex | null {
    const report = this.reportIndexesByJobId.get(jobId);
    if (!report || report.iterationId !== iterationId) {
      return null;
    }
    return report;
  }

  getAttachmentReportSection(reportId: string, sectionKey: AttachmentReportSection["sectionKey"], cursor = 0, limit = 20) {
    const sections = this.reportSectionsByReportId.get(reportId) || [];
    const page = getAttachmentReportSectionPage(sections, sectionKey, cursor, limit);
    if (!page) {
      return null;
    }
    return {
      reportId,
      sectionKey,
      sectionId: page.sectionId,
      status: page.status,
      cursor: page.cursor,
      limit: page.limit,
      nextCursor: page.nextCursor,
      total: page.total,
      data: page.data
    };
  }

  getLatestCompletedAnalysisReport(iterationId: number): AttachmentAnalysisReport | null {
    this.reconcileAnalysisJobs();
    let latest: AttachmentAnalysisJobRuntime | null = null;
    for (const job of this.analysisJobs.values()) {
      if (job.iterationId !== iterationId || job.status !== "succeeded" || !job.result) continue;
      if (!latest || job.finishedAt > latest.finishedAt) {
        latest = job;
      }
    }
    return latest?.result ?? null;
  }

  findAttachmentReportIterationId(reportId: string) {
    for (const report of this.reportIndexesByJobId.values()) {
      if (report.reportId === reportId) {
        return report.iterationId;
      }
    }
    return null;
  }

  toPublicAnalysisJob(job: AttachmentAnalysisJobRuntime): AttachmentAnalysisJob {
    const { input: _input, inputFingerprint: _inputFingerprint, ...publicJob } = job;
    return publicJob;
  }

  enqueueAttachmentAnalysisJob(iterationId: number, input: AttachmentUploadInput, inputFingerprint: string) {
    this.reconcileAnalysisJobs();
    const now = new Date().toISOString();
    const jobId = `analysis-${iterationId}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const summary = summarizeInput(input);
    const runtimeJob = createQueuedAnalysisJobOp({
      iterationId,
      input,
      inputFingerprint,
      now,
      jobId,
      inputSummary: summary
    });
    this.analysisJobs.set(jobId, runtimeJob);
    this.persistJob(runtimeJob);
    this.analysisQueue.push(jobId);
    const iteration = this.repo.findIteration(iterationId);
    if (iteration) {
      iteration.changeControl = {
        ...(iteration.changeControl || defaultIterationChangeControl()),
        lastAttachmentAnalysisJobId: jobId
      };
      this.repo.updateIteration(iteration);
    }
    this.triggerAnalysisQueue();
    return this.toPublicAnalysisJob(runtimeJob);
  }

  private triggerAnalysisQueue() {
    triggerAnalysisQueueOp({
      analysisQueue: this.analysisQueue,
      analysisJobs: this.analysisJobs,
      analysisWorkerConcurrency: this.analysisWorkerConcurrency,
      getRunningWorkers: () => this.runningAnalysisWorkers,
      setRunningWorkers: (value) => {
        this.runningAnalysisWorkers = value;
      },
      reconcile: () => this.reconcileAnalysisJobs(),
      runJobWithTimeout: (jobId) => this.runAttachmentAnalysisJobWithTimeout(jobId),
      triggerAgain: () => this.triggerAnalysisQueue()
    });
  }

  private reconcileAnalysisJobs() {
    this.runningAnalysisWorkers = reconcileAnalysisJobsOp({
      analysisJobs: this.analysisJobs,
      analysisQueuedStallTimeoutMs: this.analysisQueuedStallTimeoutMs,
      analysisJobTimeoutMs: this.analysisJobTimeoutMs
    });
  }

  private async runAttachmentAnalysisJobWithTimeout(jobId: string) {
    await runAttachmentAnalysisJobWithTimeoutOp({
      analysisJobs: this.analysisJobs,
      jobId,
      analysisJobTimeoutMs: this.analysisJobTimeoutMs,
      runAttachmentAnalysisJob: (targetJobId) => this.runAttachmentAnalysisJob(targetJobId),
      onMarkFailed: (iterationId, input, errorMessage, at) => markFailedAnalysisOp(this.repo, iterationId, input, errorMessage, at)
    });
    const job = this.analysisJobs.get(jobId);
    if (job) this.persistJob(job);
  }

  private async runAttachmentAnalysisJob(jobId: string) {
    return runAttachmentAnalysisJobOp({
      analysisJobs: this.analysisJobs,
      analysisBatchFileLimit: this.analysisBatchFileLimit,
      analysisBatchRetryLimit: this.analysisBatchRetryLimit,
      jobId,
      repo: this.repo,
      agentRunner: this.agentRunner,
      transitionIteration: (targetIterationId, toStatus, input) => {
        const result = this.transitionIteration(targetIterationId, toStatus, input);
        return { ok: result.ok, reason: "reason" in result ? result.reason : undefined };
      },
      onRecordAttachmentInputFingerprint: (iterationId, inputFingerprint) =>
        recordAttachmentInputFingerprintOp(this.repo, iterationId, inputFingerprint),
      onMarkFailed: (iterationId, input, errorMessage, at) => markFailedAnalysisOp(this.repo, iterationId, input, errorMessage, at),
      reportSectionsByReportId: this.reportSectionsByReportId,
      reportIndexesByJobId: this.reportIndexesByJobId,
      createReportId: () => shortId("rpt"),
      buildReportSections: (reportId, report) =>
        buildAttachmentReportSections({
          reportId,
          report,
          now: nowIso(),
          newSectionId: () => shortId("sec")
        }),
      onAnalysisCompleted: (iterationId, report) => {
        this.fireAnalysisCompleted(iterationId, report);
        const job = this.analysisJobs.get(jobId);
        if (job) this.persistJob(job);
        const reportIndex = this.reportIndexesByJobId.get(jobId);
        if (reportIndex) {
          this.persistReportIndex(reportIndex);
          const sections = this.reportSectionsByReportId.get(reportIndex.reportId);
          if (sections) this.persistReportSections(sections);
        }
      }
    });
  }

  private isDuplicateAttachmentUpload(iterationId: number, inputFingerprint: string) {
    return isDuplicateAttachmentUploadOp(this.repo, iterationId, inputFingerprint);
  }

  private hasPendingDuplicateJob(iterationId: number, inputFingerprint: string) {
    return hasPendingDuplicateJobOp(this.analysisJobs.values(), iterationId, inputFingerprint);
  }

  private findPendingDuplicateJob(iterationId: number, inputFingerprint: string): AttachmentAnalysisJobRuntime | null {
    return findPendingDuplicateJobOp(this.analysisJobs.values(), iterationId, inputFingerprint);
  }

  private recordAttachmentInputFingerprint(iterationId: number, inputFingerprint: string) {
    recordAttachmentInputFingerprintOp(this.repo, iterationId, inputFingerprint);
  }

  private persistRetryableAnalysisInput(iterationId: number, input: AttachmentUploadInput) {
    persistRetryableAnalysisInputOp(this.repo, iterationId, input);
  }

  private fireAnalysisCompleted(iterationId: number, report: AttachmentAnalysisReport) {
    if (this.onAnalysisCompletedCallback) {
      try {
        this.onAnalysisCompletedCallback(iterationId, report);
      } catch (err) {
        // modeling trigger failure must not block analysis pipeline
        console.error("[AnalysisService] onAnalysisCompleted callback failed for iteration", iterationId, err);
      }
    }
  }
}
