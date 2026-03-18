import type { ModelingRepository } from "../../domain/modeling/repository";
import type {
  RuleBindingReport,
  RuleCompileResult,
  SyncReport,
  TraceReport
} from "../../domain/modeling/types";
import { LlmInvocationError, LlmUnavailableError, type AgentRunner } from "../workspace/agentRunner";
import type { WorkspaceRepository } from "../../domain/workspace/repository";
import {
  calculateCoverageScores,
  buildGlobalTraceItems,
  buildProjectTraceItems,
  normalizeMethod,
  nowIso,
  parseRoadmapPath,
  resolveRoadmapGoal,
  stageOfVersion
} from "./modelingSupport";

/**
 * @deprecated 旧模型服务（基于 model.json），将被 ContinuousModelingService + ModelSnapshot 体系替代。
 * 保留兼容性，不再新增功能。新增建模逻辑请使用 ContinuousModelingService。
 */
export class ModelingService {
  constructor(
    private readonly modelRepo: ModelingRepository,
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly agentRunner: AgentRunner | null = null
  ) {}

  private writeAudit(action: string, resource: string, detail: string) {
    const workspace = this.workspaceRepo.read();
    this.workspaceRepo.appendAuditLog({
      id: this.workspaceRepo.nextId(workspace.auditLogs),
      actor: "system",
      action,
      resource,
      detail,
      createdAt: nowIso()
    });
  }

  getModel() {
    const model = this.modelRepo.read();
    return {
      ...model,
      stats: {
        entities: model.entities.length,
        relations: model.relations.length,
        rules: model.rules.length,
        pages: model.pages.length,
        apis: model.apis.length
      },
      updatedAt: nowIso()
    };
  }

  listEntities() {
    return this.modelRepo.listEntities();
  }

  listRelations(projectId?: number) {
    return this.modelRepo.listRelations(projectId);
  }

  createEntity(input: { name: string; businessLabel?: string; fields?: unknown[] }) {
    return this.modelRepo.createEntity({
      name: input.name,
      businessLabel: input.businessLabel,
      fields: Array.isArray(input.fields) ? (input.fields as never[]) : []
    });
  }

  createRelation(input: {
    projectId?: number;
    fromEntityId: string;
    toEntityId: string;
    type: "one_to_one" | "one_to_many" | "many_to_many";
    name?: string;
  }) {
    const model = this.modelRepo.read();
    const fromExists = model.entities.some((item) => item.id === input.fromEntityId);
    const toExists = model.entities.some((item) => item.id === input.toEntityId);
    if (!fromExists || !toExists) {
      return { ok: false as const, reason: "entity_not_found" };
    }
    const duplicate = model.relations.some((item) => {
      const sameProjectScope =
        typeof input.projectId === "number" && input.projectId > 0
          ? item.projectId === input.projectId
          : item.projectId === undefined;
      return (
        sameProjectScope &&
        item.fromEntityId === input.fromEntityId &&
        item.toEntityId === input.toEntityId &&
        item.type === input.type
      );
    });
    if (duplicate) {
      return { ok: false as const, reason: "relation_duplicated" };
    }
    const created = this.modelRepo.createRelation(input);
    this.writeAudit(
      "model_relation_created",
      `relation:${created.id}`,
      `${input.fromEntityId} -> ${input.toEntityId} (${input.type})`
    );
    return { ok: true as const, value: created };
  }

  deleteRelation(relationId: string, projectId?: number) {
    const deleted = this.modelRepo.deleteRelation(relationId, projectId);
    if (deleted) {
      this.writeAudit("model_relation_deleted", `relation:${relationId}`, `删除关系 ${relationId}`);
    }
    return deleted;
  }

  compileRules(): RuleCompileResult {
    const model = this.modelRepo.read();
    const warnings: string[] = [];
    let validRules = 0;

    for (const rule of model.rules) {
      if (!rule || typeof rule !== "object") {
        warnings.push("检测到非法规则对象。");
        continue;
      }
      const target = typeof rule.target === "string" ? rule.target : "";
      const type = typeof rule.type === "string" ? rule.type : "";
      if (!target) {
        warnings.push(`规则 ${rule.id || "unknown"} 缺少 target。`);
      }
      if (!type) {
        warnings.push(`规则 ${rule.id || "unknown"} 缺少 type。`);
      }
      if (target && type) {
        validRules += 1;
      }
    }

    return {
      compiledAt: nowIso(),
      ruleCount: model.rules.length,
      validRules,
      invalidRules: Math.max(0, model.rules.length - validRules),
      warnings
    };
  }

  buildSyncReport(projectId?: number): SyncReport {
    const model = this.modelRepo.read();
    const workspace = this.workspaceRepo.read();
    const projectScoped =
      typeof projectId === "number" && projectId > 0 ? workspace.projects.find((item) => item.id === projectId) : null;
    const projects = projectScoped ? 1 : projectId ? 0 : workspace.projects.length;
    const iterations = projectScoped
      ? workspace.iterations.filter((item) => item.projectId === projectScoped.id).length
      : projectId
        ? 0
        : workspace.iterations.length;
    const entities = model.entities.length;
    const pages = model.pages.length;
    const apis = model.apis.filter((api) => typeof api.path === "string" && api.path).length;

    const compile = this.compileRules();
    const { ruleQuality, coverageScore } = calculateCoverageScores({
      compileRuleCount: compile.ruleCount,
      compileValidRules: compile.validRules,
      iterationCount: iterations,
      entityCount: entities,
      apiCount: apis,
      pageCount: pages,
      projectCount: projects
    });
    const impacts: string[] = [];
    const risks: string[] = [];
    impacts.push(`模型实体 ${entities} 个，页面 ${pages} 个，接口 ${apis} 个。`);
    if (projectScoped) {
      impacts.push(`项目 ${projectScoped.name}（#${projectScoped.id}）下有 ${iterations} 个迭代参与同步评分。`);
    } else if (projectId && !projectScoped) {
      impacts.push(`projectId=${projectId} 未找到匹配项目，当前返回空项目评分。`);
      risks.push("指定项目不存在，无法提供项目级同步评分。");
    } else {
      impacts.push(`项目 ${projects} 个，迭代 ${iterations} 个参与同步评分。`);
    }
    if (compile.invalidRules > 0) {
      impacts.push(`检测到 ${compile.invalidRules} 条无效规则，可能影响自动生成稳定性。`);
      risks.push("存在未通过编译的规则，建议优先修复规则 target/type。");
    }
    if (coverageScore < 60) {
      risks.push("同步覆盖分偏低，建议补充迭代目标或减少模型冗余定义。");
    }
    if (pages === 0 || entities === 0) {
      risks.push("模型核心资产缺失，无法形成完整业务闭环。");
    }
    if (risks.length === 0) {
      risks.push("当前未发现高优先级同步风险。");
    }

    return {
      generatedAt: nowIso(),
      projectCount: projects,
      iterationCount: iterations,
      modelEntityCount: entities,
      modelRuleCount: model.rules.length,
      modelPageCount: pages,
      coverageScore,
      summary: `项目 ${projects}，迭代 ${iterations}，实体 ${entities}，规则质量 ${(ruleQuality * 100).toFixed(0)}%。`,
      impacts,
      risks
    };
  }

  bindRules(): RuleBindingReport {
    const model = this.modelRepo.read();
    const entityNames = model.entities.map((entity) => entity.name.toLowerCase());
    const bindings = model.rules.map((rule) => {
      const target = (rule.target || "").toLowerCase();
      const matchedEntities = model.entities
        .filter((entity, index) => target && (target.includes(entityNames[index]) || entityNames[index].includes(target)))
        .map((entity) => entity.name);
      const status: "bound" | "unbound" = matchedEntities.length > 0 ? "bound" : "unbound";
      return {
        ruleId: rule.id,
        target: rule.target || "",
        matchedEntities,
        status,
        reason:
          status === "bound"
            ? "已根据目标字段匹配到实体。"
            : target
              ? "未找到可匹配实体，请确认 target 命名。"
              : "规则缺少 target，无法绑定。"
      };
    });
    return {
      generatedAt: nowIso(),
      bindings
    };
  }

  buildTraceReport(projectId?: number): TraceReport {
    if (typeof projectId === "number" && projectId > 0) {
      const workspace = this.workspaceRepo.read();
      const project = workspace.projects.find((item) => item.id === projectId);
      if (!project) {
        return { generatedAt: nowIso(), items: [] };
      }
      const items = buildProjectTraceItems(workspace, projectId);
      return {
        generatedAt: nowIso(),
        items
      };
    }
    const model = this.modelRepo.read();
    const items = buildGlobalTraceItems(model);
    return {
      generatedAt: nowIso(),
      items
    };
  }

  listRoutes() {
    const model = this.modelRepo.read();
    return model.apis
      .filter((api) => typeof api.path === "string" && api.path)
      .map((api) => ({
        method: normalizeMethod(api.method),
        path: api.path as string
      }));
  }

  async generateProjectBusinessSummary(input: { projectId: number; iterationId?: number }) {
    if (!this.agentRunner) {
      throw new LlmUnavailableError("LLM runner is unavailable for project model summary");
    }
    const workspace = this.workspaceRepo.read();
    const project = workspace.projects.find((item) => item.id === input.projectId);
    if (!project) {
      return null;
    }
    const projectIterations = workspace.iterations.filter((item) => item.projectId === input.projectId);
    const targetIteration =
      typeof input.iterationId === "number" && input.iterationId > 0
        ? projectIterations.find((item) => item.id === input.iterationId) || null
        : null;
    const model = this.modelRepo.read();
    const relations = this.modelRepo.listRelations(input.projectId);
    const relationStats = new Map<string, number>();
    for (const relation of relations) {
      relationStats.set(relation.type, (relationStats.get(relation.type) || 0) + 1);
    }
    const relationProfile =
      Array.from(relationStats.entries())
        .map(([type, count]) => `${type}:${count}`)
        .join(", ") || "none";
    const prompt = {
      agentId: "project-model-summary",
      role: "iteration-coach" as const,
      scope: "iteration" as const,
      goal: "生成项目业务建模摘要",
      expectedOutput: "JSON: {summary,focus[],risks[]}",
      systemPrompt:
        "你是资深业务建模顾问。请基于输入的项目/迭代/建模数据，输出简洁、可执行、业务语义清晰的中文摘要。不要编造数据。",
      userPrompt: [
        `项目名称: ${project.name}`,
        `项目描述: ${project.description || "无"}`,
        `项目迭代总数: ${projectIterations.length}`,
        targetIteration
          ? `当前迭代: ${targetIteration.name} (version=${targetIteration.version || "未生成"}, status=${targetIteration.status}, progress=${targetIteration.progress}%)`
          : "当前迭代: 未指定",
        `模型实体数: ${model.entities.length}`,
        `模型规则数: ${model.rules.length}`,
        `模型页面数: ${model.pages.length}`,
        `项目关系数: ${relations.length}`,
        `关系类型分布: ${relationProfile}`,
        "输出要求:",
        "1) summary 为 80-180 字，强调当前建模沉淀、主要业务结构和下一步关注点。",
        "2) focus 输出 2-4 条。",
        "3) risks 输出 1-3 条。"
      ].join("\n")
    };
    let result;
    try {
      result = await this.agentRunner.run(prompt);
    } catch (error) {
      throw new LlmInvocationError(error instanceof Error ? error.message : "project_model_summary_llm_failed");
    }
    const parsed = safeParseJson(result.content);
    const summary = pickString(parsed?.summary) || pickString(result.content) || "";
    const focus = pickStringArray(parsed?.focus).slice(0, 4);
    const risks = pickStringArray(parsed?.risks).slice(0, 3);
    return {
      generatedAt: nowIso(),
      source: "llm" as const,
      model: result.model || "",
      projectId: input.projectId,
      iterationId: targetIteration?.id ?? null,
      summary:
        summary ||
        `项目 ${project.name} 当前沉淀实体 ${model.entities.length} 个、规则 ${model.rules.length} 条、关系 ${relations.length} 条。建议围绕关键业务链路补全规则闭环。`,
      focus,
      risks
    };
  }

  describeRoadmap(path: string) {
    const parsed = parseRoadmapPath(path);
    if (!parsed) {
      return null;
    }
    const model = this.modelRepo.read();
    const workspace = this.workspaceRepo.read();
    const indexToken = String(parsed.index).padStart(2, "0");
    const entityId = `entity_iteration${indexToken}`;
    const entityName = `Iteration${indexToken}`;
    const entity = model.entities.find((item) => item.id === entityId || item.name === entityName) ?? null;
    const hasStatusField = Boolean(entity?.fields?.some((field) => field.name === "status"));
    const apiDeclared = model.apis.some(
      (item) => normalizeMethod(item.method) === "GET" && (item.path || "") === path
    );

    return {
      version: `V${parsed.major}.${parsed.minor}`,
      route: path,
      stage: stageOfVersion(parsed.index),
      goal: resolveRoadmapGoal(parsed.index),
      generatedAt: nowIso(),
      modelContract: {
        apiDeclared,
        entityDeclared: Boolean(entity),
        statusFieldDeclared: hasStatusField,
        entityRef: entity?.id ?? entityName
      },
      runtime: {
        routeRegistered: true,
        implementedBy: "model-route-registry",
        workspaceProjectCount: workspace.projects.length,
        workspaceIterationCount: workspace.iterations.length
      },
      recommendation:
        apiDeclared && entity && hasStatusField
          ? "模型契约完整，可进入前后端交互能力深化。"
          : "模型契约不完整，请先补齐 API 与 Iteration.status 字段定义。"
    };
  }
}

function safeParseJson(raw: string) {
  try {
    return JSON.parse(raw) as { summary?: unknown; focus?: unknown; risks?: unknown };
  } catch {
    return null;
  }
}

function pickString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function pickStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => pickString(item)).filter(Boolean);
}
