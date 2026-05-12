import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { AgentRunner } from '../shared/agentRunner';
import type { ExperiencePolicy, ExperienceTriggerEvent } from '../../../domain/workspace/experiencePolicyTypes';
import type { ExperienceExtractionRecord } from '../../../domain/workspace/experiencePolicyTypes';
import type { ExperienceSearchResult, CrossProjectInsightsReport } from '../../../domain/workspace/experienceSearchTypes';
import type { Iteration, IterationMessage } from '../../../domain/workspace/types';
import type { IterationArtifactStage } from '../../../domain/workspace/iterationTypes';
import {
  getEffectiveExperiencePolicy,
  getPlatformExperiencePolicy,
  createExperiencePolicyOp,
  updateExperiencePolicyOp,
  deleteProjectExperiencePolicyOp
} from './experiencePolicyOps';
import { maybeExtractExperience } from './extractionOps';
import { runExperienceScan } from './scheduledScanOps';
import { searchExperienceAcrossProjects, generateCrossProjectInsights } from './crossProjectOps';

export class ExperienceService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  getPlatformPolicy(): ExperiencePolicy {
    return getPlatformExperiencePolicy(this.repo);
  }

  getEffectivePolicy(projectId: number): ExperiencePolicy {
    return getEffectiveExperiencePolicy(this.repo, projectId);
  }

  createPolicy(input: Omit<ExperiencePolicy, "id">, createdBy: string): ExperiencePolicy {
    return createExperiencePolicyOp(this.repo, input, createdBy);
  }

  updatePolicy(
    policyId: number,
    updates: Partial<Pick<ExperiencePolicy, "rules" | "scheduleScanEnabled" | "scheduleScanIntervalDays">>
  ): ExperiencePolicy | null {
    return updateExperiencePolicyOp(this.repo, policyId, updates);
  }

  deleteProjectPolicy(projectId: number): boolean {
    return deleteProjectExperiencePolicyOp(this.repo, projectId);
  }

  listExtractions(projectId: number): ExperienceExtractionRecord[] {
    return this.repo.listExperienceExtractions(projectId);
  }

  async triggerExtraction(
    event: ExperienceTriggerEvent,
    context: {
      projectId: number;
      iterationId?: number;
      iteration?: Iteration;
      stage?: IterationArtifactStage;
      messages?: IterationMessage[];
    }
  ): Promise<number[]> {
    return maybeExtractExperience(this.repo, this.agentRunner, event, context);
  }

  async runFullScan(projectId: number): Promise<{ scannedIterations: number; newEntries: number }> {
    return runExperienceScan(this.repo, this.agentRunner, projectId);
  }

  searchAcrossProjects(query: string, tenantId: string, limit?: number): ExperienceSearchResult[] {
    return searchExperienceAcrossProjects(this.repo, query, tenantId, limit);
  }

  async getCrossProjectInsights(tenantId: string): Promise<CrossProjectInsightsReport> {
    return generateCrossProjectInsights(this.repo, this.agentRunner, tenantId);
  }
}
