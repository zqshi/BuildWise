import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { IterationModelingInput } from "../../domain/continuousModeling/types";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import { ContinuousModelingService } from "./continuousModelingService";
import { buildProjectModelView } from "./continuousModelingProjectView";

export class ContinuousModelingWorkspaceService {
  constructor(
    private readonly modelingService: ContinuousModelingService,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly modelingRepo: ContinuousModelingRepository
  ) {}

  listSnapshots(projectId: number) {
    if (!this.workspaceRepo.findProject(projectId)) {
      return null;
    }
    return this.modelingService.listSnapshots(projectId);
  }

  planIterationModeling(input: IterationModelingInput) {
    const project = this.workspaceRepo.findProject(input.projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" };
    }
    const iteration = this.workspaceRepo.findIteration(input.iterationId);
    if (!iteration || iteration.projectId !== input.projectId) {
      return { ok: false as const, reason: "iteration_not_found" };
    }
    const plan = this.modelingService.planIterationModeling(input);
    return { ok: true as const, data: plan };
  }

  saveCandidate(input: IterationModelingInput) {
    const planned = this.planIterationModeling(input);
    if (!planned.ok) {
      return planned;
    }
    return { ok: true as const, data: this.modelingService.saveCandidate(planned.data) };
  }

  getProjectModelView(projectId: number, iterationId?: number) {
    const view = buildProjectModelView(this.workspaceRepo, this.modelingRepo, projectId, iterationId);
    return view;
  }

  buildCompatibilityBusinessSummary(projectId: number, iterationId?: number) {
    const view = this.getProjectModelView(projectId, iterationId);
    if (!view) {
      return null;
    }
    const summaryParts: string[] = [];
    if (view.latestSnapshotStatus === "published") {
      summaryParts.push(`当前项目已发布正式模型快照 ${view.latestSnapshotId || ""}`.trim());
    } else if (view.latestSnapshotStatus === "candidate") {
      summaryParts.push(`当前项目存在候选模型快照 ${view.latestSnapshotId || ""}`.trim());
    } else {
      summaryParts.push("当前项目尚未发布正式模型快照");
    }
    summaryParts.push(`已沉淀领域规则 ${view.rules.length} 条`);
    summaryParts.push(`数据实体 ${view.entities.length} 个`);
    summaryParts.push(`实体关系 ${view.relations.length} 条`);
    const summary = `${summaryParts.join("，")}。`;

    const focus: string[] = [];
    if (view.ontologyTerms.length > 0) {
      focus.push(`关键术语：${view.ontologyTerms.slice(0, 3).map((item) => item.businessTerm).join("、")}`);
    }
    if (view.reviewTasks.length > 0) {
      focus.push(`待确认任务：${view.reviewTasks.slice(0, 2).map((item) => item.title).join("、")}`);
    }
    if (view.evidence.length > 0) {
      focus.push(`证据来源：${view.evidence.slice(0, 2).join("、")}`);
    }

    const risks: string[] = [];
    if (view.reviewTasks.some((item) => item.blocking)) {
      risks.push(`存在 ${view.reviewTasks.filter((item) => item.blocking).length} 项阻断型待确认建模任务`);
    }
    if (view.latestSnapshotStatus === "none") {
      risks.push("尚未形成正式模型快照，业务与实现之间仍可能存在口径漂移");
    }
    if (view.relations.length === 0) {
      risks.push("实体关系尚未成网，影响跨迭代建模继承与影响分析");
    }
    if (risks.length === 0) {
      risks.push("当前未发现高优先级建模阻断风险");
    }

    return {
      generatedAt: new Date().toISOString(),
      source: "model-view-compat" as const,
      model: "project_model_view",
      projectId: view.projectId,
      iterationId: view.iterationId,
      summary,
      focus,
      risks
    };
  }
}
