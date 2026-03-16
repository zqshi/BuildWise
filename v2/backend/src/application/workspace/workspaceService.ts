import { join } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  AttachmentUploadRecord,
  AttachmentUploadFileRecord,
  AttachmentIngestJob,
  AttachmentReportIndex,
  AttachmentReportSection,
  AssessmentPayload,
  CreateIterationInput,
  IterationReleaseReviewResponse,
  IterationDeliveryPackageResult,
  IterationTestArtifactsGenerationResponse,
  IterationCodeRewriteResponse,
  IterationCodeLink,
  IterationChangeBoundary,
  Iteration,
  IterationContextPayload,
  IterationStatus,
  IterationTransitionSource,
  IterationFullCycleRunInput,
  IterationFullCycleRunResponse
} from "../../domain/workspace/types";
import type { AgentRunner } from "./agentRunner";
import { listAuditLogsOp, listGovernancePermissionPointsOp, listGovernanceRolesOp } from "./workspaceServiceGovernanceOps";
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
  locateIterationsByCodeRefOp
} from "./workspaceServiceIterationFlowOps";
import { recomputeAssessmentOp, restoreSnapshotOp, transitionIterationWithMetaOp } from "./workspaceServiceIterationAssessmentOps";
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
import { analyzeAttachmentOp } from "./workspaceServiceAnalysisOps";
import { coachIterationConversationOp } from "./workspaceServiceCoachOps";
import { executeVisualEditInstructionOp } from "./workspaceServiceVisualEditOps";
import { rewriteCodeInBoundaryOp } from "./workspaceServiceCodeRewriteOps";
import { buildIterationReleaseReviewOp, generateIterationDeliveryPackageOp, generateIterationTestArtifactsOp } from "./workspaceServiceQualityOps";
import { buildAttachmentReportSections, getAttachmentReportSectionPage } from "./workspaceServiceAttachmentReportOps";
import {
  createQueuedAnalysisJobOp,
  reconcileAnalysisJobsOp,
  triggerAnalysisQueueOp,
  type AttachmentAnalysisJobRuntime
} from "./workspaceServiceAnalysisQueueOps";
import { runAttachmentAnalysisJobOp, runAttachmentAnalysisJobWithTimeoutOp } from "./workspaceServiceAnalysisRunnerOps";
import {
  findPendingDuplicateJobOp,
  hasPendingDuplicateJobOp,
  isDuplicateAttachmentUploadOp,
  markFailedAnalysisOp,
  persistRetryableAnalysisInputOp,
  recordAttachmentInputFingerprintOp
} from "./workspaceServiceAnalysisStateOps";
import { runIterationFullCycleOp } from "./workspaceServiceFullCycleOps";
import { hasProject, listProjectsNormalized } from "./workspaceServiceCommon";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import {
  activateGlobalOrchestrationPolicyOp,
  activateProjectPolicyOp,
  appendPolicyExecutionLogOp,
  createGlobalOrchestrationPolicyDraftOp,
  createProjectPolicyDraftOp,
  evaluatePolicyGateForCoachOp,
  getEffectiveOrchestrationPolicyForProjectOp,
  getActiveGlobalOrchestrationPolicyOp,
  getActiveProjectPolicyOp,
  listGlobalOrchestrationPoliciesOp,
  listGovernanceCustomRolesOp,
  listPolicyExecutionLogsOp,
  listPlatformRoleBindingsOp,
  listProjectPoliciesOp,
  listProjectRoleBindingsOp,
  removeGovernanceCustomRoleOp,
  restoreGlobalOrchestrationPolicyToInitialModeOp,
  restoreProjectOrchestrationPolicyToInitialModeOp,
  removePlatformRoleBindingOp,
  removeProjectRoleBindingOp,
  upsertGovernanceCustomRoleOp,
  upsertPlatformRoleBindingOp,
  upsertProjectRoleBindingOp,
  upsertProjectWorkspaceBindingOp
} from "./workspaceServicePolicyOps";
import { openclawDirectChatGlobalOp, openclawDirectChatOp, probeOpenclawIntegrationOp } from "./workspaceServiceOpenclawOps";
import { readNonNegativeInt, readPositiveInt, readPositiveMs } from "./workspaceEnvParsers";
import {
  buildAttachmentInputFingerprint,
  ensureDir,
  nowIso,
  parseAttachmentInputSnapshot,
  shortId,
  summarizeInput
} from "./workspaceServiceAttachmentUtils";
import {
  completeAttachmentUploadOp,
  getAttachmentUploadOp,
  initAttachmentUploadOp,
  putAttachmentUploadChunkOp,
  submitAttachmentAnalysisJobFromUploadOp,
  type UploadInitInput
} from "./workspaceServiceAttachmentUploadOps";

export class DuplicateAttachmentUploadError extends Error {
  readonly code = "duplicate_attachment_upload";

  constructor(message = "duplicate_upload") {
    super(message);
    this.name = "DuplicateAttachmentUploadError";
  }
}

export class WorkspaceService {
  private readonly analysisJobs = new Map<string, AttachmentAnalysisJobRuntime>();

  private readonly analysisQueue: string[] = [];

  private readonly uploads = new Map<string, AttachmentUploadRecord>();

  private readonly ingestJobs = new Map<string, AttachmentIngestJob>();

  private readonly reportIndexesByJobId = new Map<string, AttachmentReportIndex>();

  private readonly reportSectionsByReportId = new Map<string, AttachmentReportSection[]>();

  private runningAnalysisWorkers = 0;

  private readonly analysisWorkerConcurrency: number;

  private readonly analysisBatchFileLimit: number;

  private readonly analysisBatchRetryLimit: number;

  private readonly analysisJobTimeoutMs: number;

  private readonly analysisQueuedStallTimeoutMs: number;

  private readonly attachmentChunkStorageDir: string;

  constructor(
    readonly repo: WorkspaceRepository,
    readonly agentRunner: AgentRunner | null = null
  ) {
    const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    this.analysisWorkerConcurrency = readPositiveInt(processEnv.ANALYSIS_JOB_CONCURRENCY, 2);
    this.analysisBatchFileLimit = readPositiveInt(processEnv.ANALYSIS_JOB_BATCH_FILE_LIMIT, 50);
    this.analysisBatchRetryLimit = readNonNegativeInt(processEnv.ANALYSIS_JOB_BATCH_RETRY_LIMIT, 2);
    this.analysisJobTimeoutMs = readPositiveMs(processEnv.ANALYSIS_JOB_TIMEOUT_MS, 25 * 60 * 1000);
    this.analysisQueuedStallTimeoutMs = readPositiveMs(processEnv.ANALYSIS_JOB_QUEUED_STALL_TIMEOUT_MS, 10 * 60 * 1000);
    this.attachmentChunkStorageDir = (processEnv.ATTACHMENT_CHUNK_STORAGE_DIR || join(process.cwd(), ".runtime", "attachment-chunks")).trim();
    ensureDir(this.attachmentChunkStorageDir);
  }

  listGovernanceRoles() {
    return listGovernanceRolesOp();
  }

  listGovernancePermissionPoints() {
    return listGovernancePermissionPointsOp();
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

  listProjectPolicies(projectId: number) {
    return listProjectPoliciesOp(this.repo, projectId);
  }

  listGlobalOrchestrationPolicies() {
    return listGlobalOrchestrationPoliciesOp(this.repo);
  }

  getActiveProjectPolicy(projectId: number) {
    return getActiveProjectPolicyOp(this.repo, projectId);
  }

  getActiveGlobalOrchestrationPolicy() {
    return getActiveGlobalOrchestrationPolicyOp(this.repo);
  }

  getEffectiveOrchestrationPolicy(projectId: number) {
    return getEffectiveOrchestrationPolicyForProjectOp(this.repo, projectId);
  }

  createProjectPolicyDraft(projectId: number, actor: string, strategy?: Record<string, unknown>) {
    return createProjectPolicyDraftOp(this.repo, {
      projectId,
      actor,
      strategy: strategy as never
    });
  }

  activateProjectPolicy(projectId: number, version: number, actor: string) {
    return activateProjectPolicyOp(this.repo, { projectId, version, actor });
  }

  createGlobalOrchestrationPolicyDraft(actor: string, strategy?: Record<string, unknown>) {
    return createGlobalOrchestrationPolicyDraftOp(this.repo, {
      actor,
      strategy: strategy as Parameters<typeof createGlobalOrchestrationPolicyDraftOp>[1]["strategy"]
    });
  }

  activateGlobalOrchestrationPolicy(version: number, actor: string) {
    return activateGlobalOrchestrationPolicyOp(this.repo, { version, actor });
  }

  restoreProjectOrchestrationPolicyToInitialMode(projectId: number, actor: string) {
    return restoreProjectOrchestrationPolicyToInitialModeOp(this.repo, { projectId, actor });
  }

  restoreGlobalOrchestrationPolicyToInitialMode(actor: string) {
    return restoreGlobalOrchestrationPolicyToInitialModeOp(this.repo, { actor });
  }

  upsertProjectWorkspaceBinding(input: {
    projectId: number;
    openclawProfile: string;
    agentId: string;
    workspacePath: string;
    runtimeMode: "openclaw-native" | "bridge";
    locked: boolean;
    createdBy: string;
  }) {
    return upsertProjectWorkspaceBindingOp(this.repo, input);
  }

  listProjectRoleBindings(projectId: number) {
    return listProjectRoleBindingsOp(this.repo, projectId);
  }

  upsertProjectRoleBinding(input: { projectId: number; userId: string; role: "admin" | "member" | "viewer" }) {
    return upsertProjectRoleBindingOp(this.repo, input);
  }

  removeProjectRoleBinding(projectId: number, userId: string) {
    return removeProjectRoleBindingOp(this.repo, projectId, userId);
  }

  listPlatformRoleBindings() {
    return listPlatformRoleBindingsOp(this.repo);
  }

  upsertPlatformRoleBinding(input: { userId: string; role: "admin" | "member" | "viewer" }) {
    return upsertPlatformRoleBindingOp(this.repo, input);
  }

  removePlatformRoleBinding(userId: string) {
    return removePlatformRoleBindingOp(this.repo, userId);
  }

  listGovernanceCustomRoles() {
    return listGovernanceCustomRolesOp(this.repo);
  }

  upsertGovernanceCustomRole(input: { roleKey?: string; name: string; description: string; level: number; permissions: string[] }) {
    return upsertGovernanceCustomRoleOp(this.repo, input);
  }

  removeGovernanceCustomRole(roleKey: string) {
    return removeGovernanceCustomRoleOp(this.repo, roleKey);
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

  transitionIteration(
    iterationId: number,
    toStatus: IterationStatus,
    input: {
      source: IterationTransitionSource;
      reason: string;
      operator: string;
      operatorRole: string;
    }
  ) {
    return transitionIterationWithMetaOp(this.repo, iterationId, toStatus, input);
  }

  recomputeAssessment(iterationId: number): AssessmentPayload | null {
    return recomputeAssessmentOp(this.repo, iterationId);
  }

  restoreSnapshot(iterationId: number, snapshotId: number): AssessmentPayload | null {
    return restoreSnapshotOp(this.repo, iterationId, snapshotId);
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
      (targetIterationId, toStatus, input) => this.transitionIteration(targetIterationId, toStatus, input),
      iterationId,
      input
    ).then((report) => {
      if (report) {
        this.recordAttachmentInputFingerprint(iterationId, inputFingerprint);
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

  initAttachmentUpload(iterationId: number, input: UploadInitInput): AttachmentUploadRecord | null {
    return initAttachmentUploadOp(
      {
        repo: this.repo,
        uploads: this.uploads,
        ingestJobs: this.ingestJobs,
        reportIndexesByJobId: this.reportIndexesByJobId,
        attachmentChunkStorageDir: this.attachmentChunkStorageDir,
        submitAttachmentAnalysisJob: (targetIterationId, analysisInput) => this.submitAttachmentAnalysisJob(targetIterationId, analysisInput)
      },
      iterationId,
      input
    );
  }

  getAttachmentUpload(iterationId: number, uploadId: string): AttachmentUploadRecord | null {
    return getAttachmentUploadOp(
      {
        repo: this.repo,
        uploads: this.uploads,
        ingestJobs: this.ingestJobs,
        reportIndexesByJobId: this.reportIndexesByJobId,
        attachmentChunkStorageDir: this.attachmentChunkStorageDir,
        submitAttachmentAnalysisJob: (targetIterationId, analysisInput) => this.submitAttachmentAnalysisJob(targetIterationId, analysisInput)
      },
      iterationId,
      uploadId
    );
  }

  putAttachmentUploadChunk(iterationId: number, uploadId: string, fileId: string, chunkIndex: number, chunk: Uint8Array): boolean {
    return putAttachmentUploadChunkOp(
      {
        repo: this.repo,
        uploads: this.uploads,
        ingestJobs: this.ingestJobs,
        reportIndexesByJobId: this.reportIndexesByJobId,
        attachmentChunkStorageDir: this.attachmentChunkStorageDir,
        submitAttachmentAnalysisJob: (targetIterationId, analysisInput) => this.submitAttachmentAnalysisJob(targetIterationId, analysisInput)
      },
      iterationId,
      uploadId,
      fileId,
      chunkIndex,
      chunk
    );
  }

  completeAttachmentUpload(iterationId: number, uploadId: string): { upload: AttachmentUploadRecord; ingestJob: AttachmentIngestJob } | null {
    return completeAttachmentUploadOp(
      {
        repo: this.repo,
        uploads: this.uploads,
        ingestJobs: this.ingestJobs,
        reportIndexesByJobId: this.reportIndexesByJobId,
        attachmentChunkStorageDir: this.attachmentChunkStorageDir,
        submitAttachmentAnalysisJob: (targetIterationId, analysisInput) => this.submitAttachmentAnalysisJob(targetIterationId, analysisInput)
      },
      iterationId,
      uploadId
    );
  }

  submitAttachmentAnalysisJobFromUpload(iterationId: number, uploadId: string, schemaVersion = "v2"): AttachmentAnalysisJob | null {
    return submitAttachmentAnalysisJobFromUploadOp(
      {
        repo: this.repo,
        uploads: this.uploads,
        ingestJobs: this.ingestJobs,
        reportIndexesByJobId: this.reportIndexesByJobId,
        attachmentChunkStorageDir: this.attachmentChunkStorageDir,
        submitAttachmentAnalysisJob: (targetIterationId, analysisInput) => this.submitAttachmentAnalysisJob(targetIterationId, analysisInput)
      },
      iterationId,
      uploadId,
      schemaVersion
    );
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
      // Current implementation reruns job-level analysis with the same input to preserve strict output contract.
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

  getAttachmentAnalysisJob(iterationId: number, jobId: string): AttachmentAnalysisJob | null {
    this.reconcileAnalysisJobs();
    const job = this.analysisJobs.get(jobId);
    if (!job || job.iterationId !== iterationId) {
      return null;
    }
    return this.toPublicAnalysisJob(job);
  }

  private toPublicAnalysisJob(job: AttachmentAnalysisJobRuntime): AttachmentAnalysisJob {
    const { input: _input, inputFingerprint: _inputFingerprint, ...publicJob } = job;
    return publicJob;
  }

  private enqueueAttachmentAnalysisJob(iterationId: number, input: AttachmentUploadInput, inputFingerprint: string) {
    this.reconcileAnalysisJobs();
    const now = new Date().toISOString();
    const jobId = `analysis-${iterationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    return runAttachmentAnalysisJobWithTimeoutOp({
      analysisJobs: this.analysisJobs,
      jobId,
      analysisJobTimeoutMs: this.analysisJobTimeoutMs,
      runAttachmentAnalysisJob: (targetJobId) => this.runAttachmentAnalysisJob(targetJobId),
      onMarkFailed: (iterationId, input, errorMessage, at) => markFailedAnalysisOp(this.repo, iterationId, input, errorMessage, at)
    });
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
        })
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

  listPolicyExecutionLogs(iterationId: number) {
    return listPolicyExecutionLogsOp(this.repo, iterationId);
  }

  appendPolicyExecutionLog(input: {
    projectId: number;
    iterationId: number;
    policyVersion: number;
    stage: string;
    action: string;
    result: "success" | "blocked" | "error";
    evidence: string[];
  }) {
    return appendPolicyExecutionLogOp(this.repo, input);
  }

  evaluatePolicyGateForCoach(iterationId: number, message: string) {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return null;
    }
    const activePolicy = this.getEffectiveOrchestrationPolicy(iteration.projectId);
    return evaluatePolicyGateForCoachOp(this.repo, iteration, message, activePolicy);
  }

  openclawDirectChat(projectId: number, message: string) {
    return openclawDirectChatOp(this.repo, { projectId, message });
  }

  openclawDirectChatGlobal(message: string) {
    return openclawDirectChatGlobalOp(this.repo, { message });
  }

  probeOpenclawIntegration() {
    return probeOpenclawIntegrationOp();
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
      role?: "delivery-engineer" | "frontend-developer" | "backend-developer";
    }
  ) {
    return rewriteCodeInBoundaryOp(this.repo, this.agentRunner, iterationId, input);
  }

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

  async runIterationFullCycle(iterationId: number, input: IterationFullCycleRunInput): Promise<IterationFullCycleRunResponse | null> {
    return runIterationFullCycleOp({
      repo: this.repo,
      agentRunner: this.agentRunner,
      iterationId,
      input,
      analyzeAttachment: (targetIterationId, analysisInput) => this.analyzeAttachment(targetIterationId, analysisInput),
      confirmIterationAnalysis: (targetIterationId, confirmInput) => this.confirmIterationAnalysis(targetIterationId, confirmInput),
      rewriteCodeInBoundary: (targetIterationId, rewriteInput) => this.rewriteCodeInBoundary(targetIterationId, rewriteInput),
      generateIterationTestArtifacts: (targetIterationId, artifactInput) => this.generateIterationTestArtifacts(targetIterationId, artifactInput),
      getIterationReleaseReview: (targetIterationId) => this.getIterationReleaseReview(targetIterationId),
      generateIterationDeliveryPackage: (targetIterationId, deliveryInput) => this.generateIterationDeliveryPackage(targetIterationId, deliveryInput),
      publishIterationToRemote: (targetIterationId, publishInput) => this.publishIterationToRemote(targetIterationId, publishInput)
    });
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
        ...(iteration.interactionState || {}),
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
