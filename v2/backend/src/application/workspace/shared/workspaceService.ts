import type { ContinuousModelingRepository } from '../../../domain/continuousModeling/repository';
import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from "./agentRunner";
import type { AgentRegistry } from '../../../infrastructure/agent/agentRegistry';
import type { CodeRewriteJobStore } from '../quality/codeRewriteJobOps';
import { resolve as resolvePath } from "node:path";
import { WorkspaceBindingConflictError } from './errors';

// ── Subdomain Services ──
import { ProjectService } from '../project/projectService';
import { GovernanceService } from '../governance/governanceService';
import { IterationService } from '../iteration/iterationService';
import { ChangeControlService } from '../changeControl/changeControlService';
import { AnalysisService } from '../analysis/analysisService';
import { UploadService } from '../upload/uploadService';
import { coachIterationConversationOp } from '../coach/coachOps';
import { QualityService } from '../quality/qualityService';
import { FullCycleService } from '../quality/fullCycleService';
import { BacklogService } from '../backlog/backlogService';
import { KnowledgeService } from '../knowledge/knowledgeService';
import { ExperienceService } from '../experience/experienceService';
import { assistantChatOp, type AssistantChatResponse } from '../assistant/assistantChatOps';
import {
  searchProjectWorkspaceKnowledge,
  syncAllProjectWorkspaceKnowledge,
  syncProjectWorkspaceKnowledge
} from '../project/projectWorkspaceKnowledgeService';

export class WorkspaceService {
  private readonly repo: WorkspaceRepository;
  private readonly agentRunner: AgentRunner | null;
  // ── Subdomain service instances ──
  readonly project: ProjectService;
  readonly governance: GovernanceService;
  readonly iteration: IterationService;
  readonly changeControl: ChangeControlService;
  readonly analysis: AnalysisService;
  readonly upload: UploadService;
  readonly quality: QualityService;
  readonly fullCycle: FullCycleService;
  readonly backlog: BacklogService;
  readonly knowledge: KnowledgeService;
  readonly experience: ExperienceService;

  constructor(
    repo: WorkspaceRepository,
    agentRunner: AgentRunner | null = null,
    modelingRepo: ContinuousModelingRepository | null = null,
    codingAgentRegistry: AgentRegistry | null = null,
    codeRewriteJobStore: CodeRewriteJobStore | null = null
  ) {
    this.repo = repo;
    this.agentRunner = agentRunner;
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
    this.knowledge = new KnowledgeService(repo, agentRunner);
    this.experience = new ExperienceService(repo, agentRunner);
    this.quality = new QualityService(repo, agentRunner, modelingRepo, codingAgentRegistry, codeRewriteJobStore);
    this.fullCycle = new FullCycleService(repo, {
      analyzeAttachment: (id, input) => this.analysis.analyzeAttachment(id, input),
      confirmIterationAnalysis: (id, input) => this.changeControl.confirmIterationAnalysis(id, input),
      rewriteCodeInBoundary: (id, input) => this.quality.rewriteCodeInBoundary(id, input),
      generateIterationTestArtifacts: (id, input) => this.quality.generateIterationTestArtifacts(id, input),
      getIterationReleaseReview: (id) => this.quality.getIterationReleaseReview(id),
      generateIterationDeliveryPackage: (id, input) => this.quality.generateIterationDeliveryPackage(id, input),
      publishIterationToRemote: (id, input) => this.project.publishIterationToRemote(id, input)
    }, agentRunner);
    this.backlog = new BacklogService(repo);
  }

  // ── Methods with real logic (not pure delegates) ──

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

  coachIterationConversation(iterationId: number, message: string) {
    return coachIterationConversationOp(this.repo, this.agentRunner, iterationId, message);
  }

  assistantChat(tenantId: string, message: string): Promise<AssistantChatResponse> {
    return assistantChatOp(this.repo, this.agentRunner, tenantId, message);
  }

  listAssistantMessages(tenantId: string, limit?: number) {
    return this.repo.listAssistantMessages(tenantId, limit);
  }

  clearAssistantMessages(tenantId: string) {
    this.repo.clearAssistantMessages(tenantId);
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
