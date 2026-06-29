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
import { resolveReviewTaskOp } from "../../domain/continuousModeling/resolveReviewTask";
import { getUnresolvedBlockingReviews } from "../../domain/continuousModeling/reviewTaskStatus";

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

  publishSnapshot(snapshotId: string, projectId: number) {
    const snapshots = this.repository.listSnapshots(projectId);
    const target = snapshots.find((item) => item.id === snapshotId);
    if (!target) {
      return { ok: false as const, reason: "snapshot_not_found" };
    }
    if (target.status !== "candidate") {
      return { ok: false as const, reason: "snapshot_not_candidate" };
    }
    // T2: 候选快照有未解决阻断评审 → 阻断发布（须先解决再发布）。
    // 已解决（resolved=true）的评审不再阻断；无阻断评审则放行（维持原有行为）。
    const unresolved = getUnresolvedBlockingReviews(target.reviewTasks);
    if (unresolved.length > 0) {
      return { ok: false as const, reason: "unresolved_blocking_reviews" };
    }
    // supersede any existing published snapshots
    const currentPublished = snapshots.filter((item) => item.status === "published");
    for (const old of currentPublished) {
      this.repository.updateSnapshotStatus(old.id, "superseded");
    }
    this.repository.updateSnapshotStatus(snapshotId, "published");
    return { ok: true as const, snapshotId };
  }

  resolveReviewTask(snapshotId: string, projectId: number, reviewTaskId: string) {
    const snapshots = this.repository.listSnapshots(projectId);
    const target = snapshots.find((item) => item.id === snapshotId);
    if (!target) {
      return { ok: false as const, reason: "snapshot_not_found" };
    }
    const result = resolveReviewTaskOp({ snapshot: target, reviewTaskId });
    if (!result.ok) {
      return result;
    }
    // 复用 saveCandidateSnapshot 的 upsert 语义写回（同 id 覆盖，保留其余快照字段）
    this.repository.saveCandidateSnapshot(result.snapshot);
    return { ok: true as const, snapshot: result.snapshot };
  }
}
