/**
 * changeImpactService — 需求影响范围前置检测编排（薄壳）
 *
 * 取 iteration → project → knowledgeBase，调 domain 纯函数 detectChangeImpactOp。
 * 不持有状态，无 LLM 依赖。本体未构建时返回 hasImpact=false（诚实）。
 */

import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import { normalizeIteration, normalizeProject } from '../shared/workspaceSupport';
import { detectChangeImpactOp, type ChangeImpactResult } from '../../../domain/workspace/changeImpactDetection';

export class ChangeImpactService {
  constructor(private readonly repo: WorkspaceRepository) {}

  detectChangeImpact(iterationId: number, userMessage: string): ChangeImpactResult {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      return {
        hasImpact: false,
        affectedTerms: [],
        affectedEntities: [],
        affectedRules: [],
        affectedArtifacts: [],
        summary: "迭代不存在，无法检测影响范围。",
      };
    }
    const normalized = normalizeIteration(iteration);
    const project = this.repo.findProject(normalized.projectId);
    const knowledgeBase = project ? normalizeProject(project).knowledgeBase : null;
    return detectChangeImpactOp({ userMessage, knowledgeBase });
  }
}
