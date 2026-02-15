import type { ModelingRepository } from "../../domain/modeling/repository";
import type {
  RuleBindingReport,
  RuleCompileResult,
  SyncReport,
  TraceReport
} from "../../domain/modeling/types";
import type { WorkspaceRepository } from "../../domain/workspace/repository";

function nowIso() {
  return new Date().toISOString();
}

function normalizeMethod(method?: string) {
  return (method || "GET").toUpperCase();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

const roadmapGoals = new Map<number, string>([
  [1, "实体/字段/规则/页面最小结构可创建与展示"],
  [2, "Figma/草图/文本输入占位与确认流程"],
  [3, "自然语言规则转结构化规则"],
  [4, "变更检测与同步报告可视化"],
  [5, "模型节点 ↔ 代码片段双向追溯"],
  [6, "一对多/多对多关系建模"],
  [7, "状态流转与工作流编排"],
  [8, "角色、权限、审计日志"],
  [9, "项目共享、版本快照、回滚"],
  [10, "模板市场、智能体执行框架"],
  [11, "开放 API 与集成中心"],
  [12, "部署管理与可观测性"]
]);

function parseRoadmapPath(path: string) {
  const match = /^\/api\/roadmap-v(\d)-(\d)$/.exec(path);
  if (!match) {
    return null;
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    return null;
  }
  const index = major === 0 ? minor : major === 1 ? 10 + minor : null;
  if (index === null || index < 1 || index > 12) {
    return null;
  }
  return { major, minor, index };
}

function stageOfVersion(index: number) {
  if (index <= 4) {
    return "S1";
  }
  if (index <= 6) {
    return "S2";
  }
  if (index <= 9) {
    return "S3";
  }
  return "S4";
}

export class ModelingService {
  constructor(
    private readonly modelRepo: ModelingRepository,
    private readonly workspaceRepo: WorkspaceRepository
  ) {}

  getModel() {
    const model = this.modelRepo.read();
    return {
      ...model,
      stats: {
        entities: model.entities.length,
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

  createEntity(input: { name: string; businessLabel?: string; fields?: unknown[] }) {
    return this.modelRepo.createEntity({
      name: input.name,
      businessLabel: input.businessLabel,
      fields: Array.isArray(input.fields) ? (input.fields as never[]) : []
    });
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

  buildSyncReport(): SyncReport {
    const model = this.modelRepo.read();
    const workspace = this.workspaceRepo.read();
    const projects = workspace.projects.length;
    const iterations = workspace.iterations.length;
    const entities = model.entities.length;
    const pages = model.pages.length;
    const apis = model.apis.filter((api) => typeof api.path === "string" && api.path).length;

    const compile = this.compileRules();
    const ruleQuality =
      compile.ruleCount === 0 ? 0.6 : clamp(compile.validRules / Math.max(1, compile.ruleCount));
    const entityIterationFit = clamp(iterations / Math.max(1, entities));
    const apiPageFit = clamp(apis / Math.max(1, pages * 2));
    const workspaceActivity = clamp((projects * 0.4 + iterations * 0.6) / Math.max(1, projects * 2));

    const coverageScore = Number(
      (
        (entityIterationFit * 0.3 +
          ruleQuality * 0.25 +
          apiPageFit * 0.25 +
          workspaceActivity * 0.2) *
        100
      ).toFixed(1)
    );
    const impacts: string[] = [];
    const risks: string[] = [];
    impacts.push(`模型实体 ${entities} 个，页面 ${pages} 个，接口 ${apis} 个。`);
    impacts.push(`项目 ${projects} 个，迭代 ${iterations} 个参与同步评分。`);
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

  buildTraceReport(): TraceReport {
    const model = this.modelRepo.read();
    const items = model.pages.flatMap((page) =>
      model.apis
        .filter((api) => typeof api.path === "string" && api.path)
        .slice(0, 3)
        .map((api) => ({
          pageRoute: page.route,
          apiPath: api.path as string,
          relation: "page-consumes-api",
          modelRef: `page:${page.id}`,
          codeRef: `backend/interfaces/http/routes#${(api.path as string).split("/").join("_")}`,
          intent: `页面 ${page.name} 使用接口 ${api.path as string}`
        }))
    );
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
      goal: roadmapGoals.get(parsed.index) || "待补充目标定义",
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
