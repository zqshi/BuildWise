import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { IterationModelingInput, IterationModelingPlan, ModelSnapshot } from "../../domain/continuousModeling/types";
import {
  buildReviewTasks,
  detectChangedEntityNames,
  detectChangedRuleNames,
  detectChangedTerms,
  normalizeOntologyTerms,
  nowIso
} from "./continuousModelingSupport";

export class ContinuousModelingService {
  private readonly repository: ContinuousModelingRepository;
  constructor(repository: ContinuousModelingRepository) {
    this.repository = repository;
  }

  listSnapshots(projectId: number) {
    return this.repository.listSnapshots(projectId);
  }

  planIterationModeling(input: IterationModelingInput): IterationModelingPlan {
    const baseline = input.baselineSnapshot || this.repository.getLatestPublishedSnapshot(input.projectId);
    const normalizedTerms = normalizeOntologyTerms(input.ontologyTerms);
    const changedTerms = detectChangedTerms(normalizedTerms, baseline);
    const changedEntities = detectChangedEntityNames(input.entities, baseline);
    const changedRules = detectChangedRuleNames(input.rules, baseline);
    const reviewTasks = buildReviewTasks({ ...input, ontologyTerms: normalizedTerms }, changedTerms);
    const candidateSnapshot: ModelSnapshot = {
      id: `snapshot-${input.projectId}-${input.iterationId}-candidate`,
      projectId: input.projectId,
      iterationId: input.iterationId,
      version: `${input.projectId}.${input.iterationId}.candidate`,
      status: "candidate",
      ontologyTerms: normalizedTerms,
      entities: input.entities,
      relations: input.relations,
      rules: input.rules,
      reviewTasks,
      derivedFromSnapshotId: baseline?.id || null,
      createdAt: nowIso()
    };
    return {
      candidateSnapshot,
      summary: `候选快照已生成：新增术语 ${changedTerms.length} 个，新增实体 ${changedEntities.length} 个，新增规则 ${changedRules.length} 条。`,
      changedTerms,
      changedEntities,
      changedRules,
      blockingReviewTasks: reviewTasks.filter((item) => item.blocking)
    };
  }

  saveCandidate(plan: IterationModelingPlan) {
    this.repository.saveCandidateSnapshot(plan.candidateSnapshot);
    return {
      ok: true as const,
      snapshotId: plan.candidateSnapshot.id,
      reviewTaskCount: plan.blockingReviewTasks.length
    };
  }
}
