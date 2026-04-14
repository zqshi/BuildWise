import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { IterationModelingInput, ModelSnapshot } from "../../domain/continuousModeling/types";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { ProjectKnowledgeBase } from "../../domain/workspace/projectTypes";
import type { ContinuousModelingService } from "./continuousModelingService";
import { getIterationAccessContext, getProjectAccessContext } from '../workspace/shared/tenantAccess';
import { buildProjectModelView } from "./continuousModelingProjectView";

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

export type SnapshotDiffSummary = {
  previousSnapshotId: string | null;
  addedTerms: string[];
  removedTerms: string[];
  addedEntities: string[];
  removedEntities: string[];
  addedRules: string[];
  removedRules: string[];
  summary: string;
};

function diffSnapshots(
  candidate: ModelSnapshot,
  baseline: ModelSnapshot | null
): SnapshotDiffSummary {
  const prevTerms = new Set((baseline?.ontologyTerms ?? []).map((t) => t.canonicalTerm));
  const curTerms = new Set(candidate.ontologyTerms.map((t) => t.canonicalTerm));
  const addedTerms = candidate.ontologyTerms
    .filter((t) => !prevTerms.has(t.canonicalTerm))
    .map((t) => t.canonicalTerm);
  const removedTerms = (baseline?.ontologyTerms ?? [])
    .filter((t) => !curTerms.has(t.canonicalTerm))
    .map((t) => t.canonicalTerm);

  const prevEntities = new Set((baseline?.entities ?? []).map((e) => e.name));
  const curEntities = new Set(candidate.entities.map((e) => e.name));
  const addedEntities = candidate.entities
    .filter((e) => !prevEntities.has(e.name))
    .map((e) => e.name);
  const removedEntities = (baseline?.entities ?? [])
    .filter((e) => !curEntities.has(e.name))
    .map((e) => e.name);

  const prevRules = new Set((baseline?.rules ?? []).map((r) => r.statement));
  const curRules = new Set(candidate.rules.map((r) => r.statement));
  const addedRules = candidate.rules
    .filter((r) => !prevRules.has(r.statement))
    .map((r) => r.statement);
  const removedRules = (baseline?.rules ?? [])
    .filter((r) => !curRules.has(r.statement))
    .map((r) => r.statement);

  const parts: string[] = [];
  if (addedTerms.length > 0) parts.push(`新增术语 ${addedTerms.length} 个`);
  if (removedTerms.length > 0) parts.push(`移除术语 ${removedTerms.length} 个`);
  if (addedEntities.length > 0) parts.push(`新增实体 ${addedEntities.length} 个`);
  if (removedEntities.length > 0) parts.push(`移除实体 ${removedEntities.length} 个`);
  if (addedRules.length > 0) parts.push(`新增规则 ${addedRules.length} 条`);
  if (removedRules.length > 0) parts.push(`移除规则 ${removedRules.length} 条`);

  return {
    previousSnapshotId: baseline?.id ?? null,
    addedTerms,
    removedTerms,
    addedEntities,
    removedEntities,
    addedRules,
    removedRules,
    summary: parts.length > 0 ? parts.join("，") : "无变更",
  };
}

// ---------------------------------------------------------------------------
// KB writeback from snapshot
// ---------------------------------------------------------------------------

function snapshotToKbPatch(
  snapshot: ModelSnapshot,
  existingKb: ProjectKnowledgeBase
): ProjectKnowledgeBase {
  const termMap = new Map(existingKb.ontologyTerms.map((t) => [t.term, t]));
  for (const st of snapshot.ontologyTerms) {
    if (!termMap.has(st.canonicalTerm)) {
      termMap.set(st.canonicalTerm, {
        term: st.canonicalTerm,
        aliases: [...st.aliases, ...st.technicalAliases],
        definition: st.definition,
        evidence: st.evidence.join("; "),
      });
    }
  }

  const ruleMap = new Map(existingKb.stableRules.map((r) => [r.rule, r]));
  for (const sr of snapshot.rules) {
    if (!ruleMap.has(sr.statement)) {
      ruleMap.set(sr.statement, {
        rule: sr.statement,
        rationale: `from model snapshot ${snapshot.id}`,
        source: "continuous-modeling",
      });
    }
  }

  const compMap = new Map(existingKb.componentInventory.map((c) => [c.component, c]));
  for (const se of snapshot.entities) {
    if (!compMap.has(se.name)) {
      compMap.set(se.name, {
        component: se.name,
        responsibility: se.businessName,
        relatedRequirements: [],
        relatedCodePaths: [],
      });
    }
  }

  return {
    ...existingKb,
    ontologyTerms: Array.from(termMap.values()),
    stableRules: Array.from(ruleMap.values()),
    componentInventory: Array.from(compMap.values()),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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
    const saved = this.modelingService.saveCandidate(planned.data);

    // Auto-generate diff summary against previous published snapshot
    const baseline = this.modelingRepo.getLatestPublishedSnapshot(input.projectId);
    const diff = diffSnapshots(planned.data.candidateSnapshot, baseline);

    return { ok: true as const, data: saved, diff };
  }

  publishSnapshot(snapshotId: string, projectId: number) {
    const project = this.workspaceRepo.findProject(projectId);
    if (!project) {
      return { ok: false as const, reason: "project_not_found" };
    }
    const result = this.modelingService.publishSnapshot(snapshotId, projectId);
    if (!result.ok) return result;

    // Bi-directional KB sync: write snapshot data back to project KB
    const snapshots = this.modelingRepo.listSnapshots(projectId);
    const published = snapshots.find((s) => s.id === snapshotId);
    if (published) {
      const existingKb = project.knowledgeBase ?? {
        ontologyTerms: [],
        stableRules: [],
        componentInventory: [],
        codeMap: [],
        decisionLog: [],
        knownRisks: [],
        changePatterns: [],
        updatedAt: "",
      };
      const patchedKb = snapshotToKbPatch(published, existingKb);
      this.workspaceRepo.updateProject({ ...project, knowledgeBase: patchedKb });
    }

    return result;
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

  getProjectAccess(userId: string, projectId: number) {
    return getProjectAccessContext(this.workspaceRepo, projectId, userId);
  }

  getIterationAccess(userId: string, iterationId: number) {
    return getIterationAccessContext(this.workspaceRepo, iterationId, userId);
  }
}
