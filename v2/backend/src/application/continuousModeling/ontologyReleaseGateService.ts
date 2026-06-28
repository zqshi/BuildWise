/**
 * OntologyGateService — 本体发布门禁查询（v0.24.0 核心价值主线夯实）
 *
 * 突出核心价值：发布前检查本体快照已发布且无未解决阻断评审。
 * 桥接 workspace（迭代→项目）与 continuousModeling（快照状态+评审），
 * 调 domain 纯函数 evaluateOntologyReleaseGate 做温和门禁判定。
 *
 * 与 ChangeImpactService 同构：服务层薄封装，判定逻辑在 domain 纯函数。
 */
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import { buildProjectModelView } from "./continuousModelingProjectView";
import { evaluateOntologyReleaseGate, type OntologyReleaseGateResult } from "../../domain/continuousModeling/ontologyReleaseGate";

export class OntologyGateService {
  constructor(
    private readonly repo: WorkspaceRepository,
    private readonly modelingRepo: ContinuousModelingRepository | null
  ) {}

  evaluateOntologyGate(iterationId: number): OntologyReleaseGateResult {
    const iteration = this.repo.findIteration(iterationId);
    if (!iteration) {
      // 迭代不存在，不阻断（由其他门禁处理）
      return { passed: true, reasons: [] };
    }
    const view = buildProjectModelView(this.repo, this.modelingRepo, iteration.projectId, iterationId);
    return evaluateOntologyReleaseGate({
      latestSnapshotStatus: view?.latestSnapshotStatus ?? "none",
      blockingReviewTasks: (view?.reviewTasks ?? []).filter((task) => task.blocking)
    });
  }
}
