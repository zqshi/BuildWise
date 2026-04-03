import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type {
  AttachmentUploadInput,
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  AttachmentUploadRecord,
  AttachmentIngestJob,
  AttachmentReportIndex,
  AttachmentReportSection,
  AssessmentPayload,
  CreateIterationInput,
  IterationReleaseReviewResponse,
  IterationDeliveryPackageResult,
  IterationTestArtifactsGenerationResponse,
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
import type { UploadInitInput } from "./workspaceServiceAttachmentUploadOps";
import { resolve as resolvePath } from "node:path";
import { WorkspaceBindingConflictError } from "./workspaceErrors";

// ── Subdomain Services ──
import { ProjectService } from "./projectService";
import { GovernanceService } from "./governanceService";
import { IterationService } from "./iterationService";
import { ChangeControlService } from "./changeControlService";
import { AnalysisService } from "./analysisService";
import { UploadService } from "./uploadService";
import { CoachService } from "./coachService";
import { QualityService } from "./qualityService";
import { FullCycleService } from "./fullCycleService";
import {
  searchProjectWorkspaceKnowledge,
  syncAllProjectWorkspaceKnowledge,
  syncProjectWorkspaceKnowledge
} from "./projectWorkspaceKnowledgeService";
import { getIterationAccessContext } from "./workspaceTenantAccess";

export class WorkspaceService {
  private readonly repo: WorkspaceRepository;
  // ── Subdomain service instances ──
  readonly project: ProjectService;
  readonly governance: GovernanceService;
  readonly iteration: IterationService;
  readonly changeControl: ChangeControlService;
  readonly analysis: AnalysisService;
  readonly upload: UploadService;
  readonly coach: CoachService;
  readonly quality: QualityService;
  readonly fullCycle: FullCycleService;

  constructor(
    repo: WorkspaceRepository,
    agentRunner: AgentRunner | null = null,
    modelingRepo: ContinuousModelingRepository | null = null
  ) {
    this.repo = repo;
    this.project = new ProjectService(repo);
    this.governance = new GovernanceService(repo);
    this.iteration = new IterationService(repo, agentRunner);
    this.changeControl = new ChangeControlService(repo);
    this.analysis = new AnalysisService(
      repo,
      (iterationId, toStatus, input) => {
        const result = this.iteration.transitionIteration(iterationId, toStatus, input);
        return { ok: result.ok, reason: "reason" in result ? result.reason : undefined };
      },
      agentRunner
    );
    this.upload = new UploadService(repo, this.analysis, agentRunner);
    this.coach = new CoachService(repo, agentRunner, modelingRepo);
    this.quality = new QualityService(repo, agentRunner, modelingRepo);
    this.fullCycle = new FullCycleService(repo, {
      analyzeAttachment: (id, input) => this.analysis.analyzeAttachment(id, input),
      confirmIterationAnalysis: (id, input) => this.changeControl.confirmIterationAnalysis(id, input),
      rewriteCodeInBoundary: (id, input) => this.quality.rewriteCodeInBoundary(id, input),
      generateIterationTestArtifacts: (id, input) => this.quality.generateIterationTestArtifacts(id, input),
      getIterationReleaseReview: (id) => this.quality.getIterationReleaseReview(id),
      generateIterationDeliveryPackage: (id, input) => this.quality.generateIterationDeliveryPackage(id, input),
      publishIterationToRemote: (id, input) => this.project.publishIterationToRemote(id, input)
    }, agentRunner);
  }

  // ═══════════════════════════════════════════════════
  //  Backward-compatible delegates — all existing
  //  method signatures are preserved.
  // ═══════════════════════════════════════════════════

  // ── Governance ──
  listGovernanceRoles() { return this.governance.listGovernanceRoles(); }
  listGovernancePermissionPoints() { return this.governance.listGovernancePermissionPoints(); }
  listAuditLogs(limit = 50) { return this.governance.listAuditLogs(limit); }
  listGovernanceCustomRoles() { return this.governance.listGovernanceCustomRoles(); }
  upsertGovernanceCustomRole(input: { roleKey?: string; name: string; description: string; level: number; permissions: string[] }) {
    return this.governance.upsertGovernanceCustomRole(input);
  }
  removeGovernanceCustomRole(roleKey: string) { return this.governance.removeGovernanceCustomRole(roleKey); }
  resolveRolePermissions(roleKey: string) { return this.governance.resolveRolePermissions(roleKey); }
  resolveWorkspaceRole(roleKey: string) { return this.governance.resolveWorkspaceRole(roleKey); }
  listPlatformRoleBindings() { return this.governance.listPlatformRoleBindings(); }
  upsertPlatformRoleBinding(input: { userId: string; role: string }) { return this.governance.upsertPlatformRoleBinding(input); }
  removePlatformRoleBinding(userId: string) { return this.governance.removePlatformRoleBinding(userId); }
  listProjectRoleBindings(projectId: number) { return this.governance.listProjectRoleBindings(projectId); }
  upsertProjectRoleBinding(input: { projectId: number; userId: string; role: "admin" | "member" | "viewer" }) {
    return this.governance.upsertProjectRoleBinding(input);
  }
  removeProjectRoleBinding(projectId: number, userId: string) { return this.governance.removeProjectRoleBinding(projectId, userId); }
  listTenantMemberBindings(tenantId: string) { return this.governance.listTenantMemberBindings(tenantId); }
  upsertTenantMemberBinding(input: { tenantId: string; userId: string; role: "admin" | "member" | "viewer" }) {
    return this.governance.upsertTenantMemberBinding(input);
  }
  removeTenantMemberBinding(tenantId: string, userId: string) { return this.governance.removeTenantMemberBinding(tenantId, userId); }
  listProjectPolicies(projectId: number) { return this.governance.listProjectPolicies(projectId); }
  listGlobalOrchestrationPolicies() { return this.governance.listGlobalOrchestrationPolicies(); }
  getActiveProjectPolicy(projectId: number) { return this.governance.getActiveProjectPolicy(projectId); }
  getActiveGlobalOrchestrationPolicy() { return this.governance.getActiveGlobalOrchestrationPolicy(); }
  getEffectiveOrchestrationPolicy(projectId: number) { return this.governance.getEffectiveOrchestrationPolicy(projectId); }
  createProjectPolicyDraft(projectId: number, actor: string, strategy?: Record<string, unknown>) {
    return this.governance.createProjectPolicyDraft(projectId, actor, strategy);
  }
  activateProjectPolicy(projectId: number, version: number, actor: string) {
    return this.governance.activateProjectPolicy(projectId, version, actor);
  }
  createGlobalOrchestrationPolicyDraft(actor: string, strategy?: Record<string, unknown>) {
    return this.governance.createGlobalOrchestrationPolicyDraft(actor, strategy);
  }
  activateGlobalOrchestrationPolicy(version: number, actor: string) {
    return this.governance.activateGlobalOrchestrationPolicy(version, actor);
  }
  restoreProjectOrchestrationPolicyToInitialMode(projectId: number, actor: string) {
    return this.governance.restoreProjectOrchestrationPolicyToInitialMode(projectId, actor);
  }
  restoreGlobalOrchestrationPolicyToInitialMode(actor: string) {
    return this.governance.restoreGlobalOrchestrationPolicyToInitialMode(actor);
  }
  upsertProjectWorkspaceBinding(input: {
    projectId: number;
    assistantProfile: string;
    agentId: string;
    workspacePath: string;
    runtimeMode: "native" | "bridge";
    locked: boolean;
    createdBy: string;
  }) {
    const workspacePath = resolvePath(input.workspacePath.trim());
    this.assertWorkspaceBindingIsolation(input.projectId, workspacePath);
    const record = this.governance.upsertProjectWorkspaceBinding({
      ...input,
      workspacePath
    });
    syncProjectWorkspaceKnowledge(this.repo, input.projectId);
    return record;
  }
  syncProjectWorkspaceKnowledge(projectId: number) {
    return syncProjectWorkspaceKnowledge(this.repo, projectId);
  }
  syncAllProjectWorkspaceKnowledge() {
    return syncAllProjectWorkspaceKnowledge(this.repo);
  }
  searchProjectWorkspaceKnowledge(projectId: number, query: string, limit = 4) {
    return searchProjectWorkspaceKnowledge(this.repo, projectId, query, limit);
  }
  listPolicyExecutionLogs(iterationId: number) { return this.governance.listPolicyExecutionLogs(iterationId); }
  appendPolicyExecutionLog(input: {
    projectId: number;
    iterationId: number;
    policyVersion: number;
    stage: string;
    action: string;
    result: "success" | "blocked" | "error";
    evidence: string[];
  }) {
    return this.governance.appendPolicyExecutionLog(input);
  }
  evaluatePolicyGateForCoach(iterationId: number, message: string) {
    return this.governance.evaluatePolicyGateForCoach(iterationId, message);
  }

  // ── Project ──
  hasProject(projectId: number) { return this.project.hasProject(projectId); }
  findProject(projectId: number) { return this.repo.findProject(projectId); }
  listProjects() { return this.project.listProjects(); }
  listProjectsForUser(userId: string, tenantId?: string) { return this.project.listProjectsForUser(userId, tenantId); }
  createProject(input: { name: string; description: string; tenantId: string; ownerUserId: string }) { return this.project.createProject(input); }
  archiveProject(projectId: number) { return this.project.archiveProject(projectId); }
  getProjectAccess(userId: string, projectId: number) { return this.project.getProjectAccess(userId, projectId); }
  getTenantAccess(userId: string, tenantId: string) { return this.project.getTenantAccess(userId, tenantId); }
  listAccessibleTenants(userId: string) { return this.project.listAccessibleTenants(userId); }
  findIteration(iterationId: number) { return this.repo.findIteration(iterationId); }
  getIterationAccess(userId: string, iterationId: number) { return getIterationAccessContext(this.repo, iterationId, userId); }
  getProjectRepository(projectId: number) { return this.project.getProjectRepository(projectId); }
  bootstrapProjectRepository(
    projectId: number,
    input: Partial<
      Pick<NonNullable<ReturnType<typeof this.project.getProjectRepository>>, "provider" | "organization" | "name" | "url" | "defaultBranch" | "repoMode"> & {
        requireRemoteForProduction: boolean;
        requireRemoteForStaging: boolean;
      }
    >
  ) {
    return this.project.bootstrapProjectRepository(projectId, input);
  }
  validateProjectRepositoryRemote(projectId: number, input: { url?: string }) {
    return this.project.validateProjectRepositoryRemote(projectId, input);
  }
  configureProjectRepositoryMode(
    projectId: number,
    input: {
      repoMode?: "external_git" | "managed_local" | "hybrid";
      requireRemoteForProduction?: boolean;
      requireRemoteForStaging?: boolean;
    }
  ) {
    return this.project.configureProjectRepositoryMode(projectId, input);
  }
  getProjectRepositoryStatus(projectId: number) { return this.project.getProjectRepositoryStatus(projectId); }
  getProjectRepositoryMigrationPlan(projectId: number) { return this.project.getProjectRepositoryMigrationPlan(projectId); }
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
    return this.project.provisionProjectRepository(projectId, input);
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
    return this.project.scaffoldProjectRepository(projectId, input);
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
    return this.project.publishIterationToRemote(iterationId, input);
  }

  // ── Iteration ──
  listIterations(projectId: number) { return this.iteration.listIterations(projectId); }
  createIteration(projectId: number, payload: CreateIterationInput) { return this.iteration.createIteration(projectId, payload); }
  deleteIteration(iterationId: number) { return this.iteration.deleteIteration(iterationId); }
  listMessages(iterationId: number, opts?: { limit?: number; offset?: number }) { return this.iteration.listMessages(iterationId, opts); }
  createMessage(iterationId: number, role: "system" | "assistant" | "user", content: string) {
    return this.iteration.createMessage(iterationId, role, content);
  }
  getIterationContext(iterationId: number): IterationContextPayload | null { return this.iteration.getIterationContext(iterationId); }
  getAssessment(iterationId: number): AssessmentPayload | null { return this.iteration.getAssessment(iterationId); }
  listAssessmentSnapshots(iterationId: number) { return this.iteration.listAssessmentSnapshots(iterationId); }
  getStateMachine(iterationId: number) { return this.iteration.getStateMachine(iterationId); }
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
    return this.iteration.transitionIteration(iterationId, toStatus, input);
  }
  recomputeAssessment(iterationId: number): AssessmentPayload | null { return this.iteration.recomputeAssessment(iterationId); }
  restoreSnapshot(iterationId: number, snapshotId: number): AssessmentPayload | null {
    return this.iteration.restoreSnapshot(iterationId, snapshotId);
  }
  locateIterationsByCodeRef(projectId: number, ref: string) { return this.iteration.locateIterationsByCodeRef(projectId, ref); }
  updateIterationInteractionState(
    iterationId: number,
    input: {
      hasPrototypeAssets: boolean;
      uploadKind?: "documents" | "prototype" | "mixed" | "other";
      lastAttachmentName?: string;
    }
  ): Iteration | null {
    return this.iteration.updateIterationInteractionState(iterationId, input);
  }

  // ── Change Control ──
  getIterationChangeControl(iterationId: number) { return this.changeControl.getIterationChangeControl(iterationId); }
  getIterationArtifactWorkflow(iterationId: number) { return this.changeControl.getIterationArtifactWorkflow(iterationId); }
  saveIterationArtifactDraft(iterationId: number, artifactId: string, input: { content: string; media?: string[]; actor?: string }) {
    return this.changeControl.saveIterationArtifactDraft(iterationId, artifactId, input);
  }
  commitIterationArtifact(
    iterationId: number,
    artifactId: string,
    input: { actor?: string; summary?: string; evidence?: string[]; source?: string }
  ) {
    return this.changeControl.commitIterationArtifact(iterationId, artifactId, input);
  }
  confirmIterationArtifact(iterationId: number, artifactId: string, input: { actor?: string; passed?: boolean; note?: string }) {
    return this.changeControl.confirmIterationArtifact(iterationId, artifactId, input);
  }
  appendIterationArtifactToConversation(iterationId: number, artifactId: string, input: { actor?: string; prompt?: string }) {
    return this.changeControl.appendIterationArtifactToConversation(iterationId, artifactId, input);
  }
  transitionIterationArtifactStage(
    iterationId: number,
    toStage: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive",
    input: { actor?: string; note?: string }
  ) {
    return this.changeControl.transitionIterationArtifactStage(iterationId, toStage, input);
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
    return this.changeControl.confirmIterationAnalysis(iterationId, input);
  }
  updateIterationBoundary(iterationId: number, input: Partial<IterationChangeBoundary>) {
    return this.changeControl.updateIterationBoundary(iterationId, input);
  }
  updateClarificationDraft(iterationId: number, resolvedQuestions: string[]) {
    return this.changeControl.updateClarificationDraft(iterationId, resolvedQuestions);
  }
  updateIterationTestMatrixExecution(
    iterationId: number,
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) {
    return this.changeControl.updateIterationTestMatrixExecution(iterationId, updates);
  }
  bindIterationCodeLink(
    iterationId: number,
    input: Partial<Pick<IterationCodeLink, "branch" | "tag" | "commit" | "pr" | "paths" | "note">>
  ) {
    return this.changeControl.bindIterationCodeLink(iterationId, input);
  }
  getIterationCodeLink(iterationId: number) { return this.changeControl.getIterationCodeLink(iterationId); }

  // ── Analysis ──
  analyzeAttachment(iterationId: number, input: AttachmentUploadInput): Promise<AttachmentAnalysisReport | null> {
    return this.analysis.analyzeAttachment(iterationId, input);
  }
  submitAttachmentAnalysisJob(iterationId: number, input: AttachmentUploadInput): AttachmentAnalysisJob | null {
    return this.analysis.submitAttachmentAnalysisJob(iterationId, input);
  }
  retryLatestFailedAttachmentAnalysisJob(iterationId: number): AttachmentAnalysisJob | null {
    return this.analysis.retryLatestFailedAttachmentAnalysisJob(iterationId);
  }
  retryAttachmentAnalysisJob(iterationId: number, options?: { jobId?: string; scope?: "job" | "batch" }): AttachmentAnalysisJob | null {
    return this.analysis.retryAttachmentAnalysisJob(iterationId, options);
  }
  getAttachmentAnalysisJob(iterationId: number, jobId: string): AttachmentAnalysisJob | null {
    return this.analysis.getAttachmentAnalysisJob(iterationId, jobId);
  }
  getAttachmentReportIndexByJob(iterationId: number, jobId: string): AttachmentReportIndex | null {
    return this.analysis.getAttachmentReportIndexByJob(iterationId, jobId);
  }
  getAttachmentReportSection(reportId: string, sectionKey: AttachmentReportSection["sectionKey"], cursor = 0, limit = 20) {
    return this.analysis.getAttachmentReportSection(reportId, sectionKey, cursor, limit);
  }

  findAttachmentReportIterationId(reportId: string) {
    return this.analysis.findAttachmentReportIterationId(reportId);
  }

  // ── Upload ──
  initAttachmentUpload(iterationId: number, input: UploadInitInput): AttachmentUploadRecord | null {
    return this.upload.initAttachmentUpload(iterationId, input);
  }
  getAttachmentUpload(iterationId: number, uploadId: string): AttachmentUploadRecord | null {
    return this.upload.getAttachmentUpload(iterationId, uploadId);
  }
  putAttachmentUploadChunk(iterationId: number, uploadId: string, fileId: string, chunkIndex: number, chunk: Uint8Array): boolean {
    return this.upload.putAttachmentUploadChunk(iterationId, uploadId, fileId, chunkIndex, chunk);
  }
  completeAttachmentUpload(iterationId: number, uploadId: string): { upload: AttachmentUploadRecord; ingestJob: AttachmentIngestJob } | null {
    return this.upload.completeAttachmentUpload(iterationId, uploadId);
  }
  submitAttachmentAnalysisJobFromUpload(iterationId: number, uploadId: string, schemaVersion = "v2"): AttachmentAnalysisJob | null {
    return this.upload.submitAttachmentAnalysisJobFromUpload(iterationId, uploadId, schemaVersion);
  }

  // ── Coach ──
  coachIterationConversation(iterationId: number, message: string) {
    return this.coach.coachIterationConversation(iterationId, message);
  }

  detectIterationChangeImpact(iterationId: number, userMessage: string) {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) return null;

    const project = this.repo.findProject(iteration.projectId);
    const snapshot = null; // 简化实现，不依赖 modelingRepo

    const { detectChangeImpactFromMessage } = require("./changeImpactDetector");
    return detectChangeImpactFromMessage(
      userMessage,
      iteration,
      snapshot,
      project?.knowledgeBase ?? {
        ontologyTerms: [], stableRules: [], componentInventory: [], codeMap: [],
        decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ''
      }
    );
  }

  // ── Quality / Code ──
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
    return this.quality.executeVisualEditInstruction(iterationId, message, target);
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
    return this.quality.rewriteCodeInBoundary(iterationId, input);
  }
  async generateIterationTestArtifacts(
    iterationId: number,
    input: { dryRun?: boolean } = {}
  ): Promise<IterationTestArtifactsGenerationResponse | null> {
    return this.quality.generateIterationTestArtifacts(iterationId, input);
  }
  getIterationReleaseReview(iterationId: number): IterationReleaseReviewResponse | null {
    return this.quality.getIterationReleaseReview(iterationId);
  }
  async generateIterationDeliveryPackage(
    iterationId: number,
    input: { dryRun?: boolean; releaseReview?: IterationReleaseReviewResponse | null } = {}
  ): Promise<IterationDeliveryPackageResult | null> {
    return this.quality.generateIterationDeliveryPackage(iterationId, input);
  }

  // ── Full Cycle ──
  async runIterationFullCycle(iterationId: number, input: IterationFullCycleRunInput): Promise<IterationFullCycleRunResponse | null> {
    return this.fullCycle.runIterationFullCycle(iterationId, input);
  }

  private assertWorkspaceBindingIsolation(projectId: number, workspacePath: string) {
    const conflictingBinding = this.repo
      .listProjects()
      .filter((project) => project.id !== projectId)
      .flatMap((project) => this.repo.listProjectWorkspaceBindings(project.id))
      .find((binding) => resolvePath(binding.workspacePath.trim()) === workspacePath);

    if (conflictingBinding) {
      throw new WorkspaceBindingConflictError(
        `workspace_path_already_bound: project=${conflictingBinding.projectId} path=${workspacePath}`
      );
    }
  }
}
