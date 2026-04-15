import type { IterationArtifactWorkflow, IterationArtifactStage } from '../../../domain/workspace/types';

type ArtifactWorkflowMode = "generic" | "first-iteration" | "subsequent-iteration";

function resolveAnalysisTitle(mode: ArtifactWorkflowMode) {
  if (mode === "first-iteration") return "首版需求分析报告";
  if (mode === "subsequent-iteration") return "继承差异分析报告";
  return "需求分析报告";
}

function resolveAnalysisDescription(mode: ArtifactWorkflowMode) {
  if (mode === "first-iteration") {
    return "沉淀首版目标理解、业务对象、纳入项、排除项与待确认问题。";
  }
  if (mode === "subsequent-iteration") {
    return "沉淀继承基线、增量差异、影响边界与回滚关注点。";
  }
  return "沉淀当前版本目标理解、边界、风险与待确认问题。";
}

type ArtifactDef = {
  id: string;
  stage: IterationArtifactStage;
  title: string;
  category: string;
  description: string;
  source: string;
  downstreamImpacts: IterationArtifactStage[];
};

const ARTIFACT_DEFINITIONS: readonly ArtifactDef[] = [
  { id: "analysis-report", stage: "clarification", title: "", category: "分析报告", description: "", source: "analysisReport", downstreamImpacts: ["scope", "interaction", "development", "testing", "release", "archive"] },
  { id: "product-requirements-doc", stage: "clarification", title: "产品需求文档", category: "PRD", description: "沉淀问题定义、用户场景、功能需求、非功能要求与验收标准。", source: "analysisReport.prd", downstreamImpacts: ["scope", "interaction", "development", "testing", "release", "archive"] },
  { id: "boundary-confirmation", stage: "scope", title: "边界确认", category: "范围定义", description: "定义 requirement/component/codePath 边界。", source: "changeControl.boundary", downstreamImpacts: ["interaction", "development", "testing", "release", "archive"] },
  { id: "prototype-preview", stage: "interaction", title: "原型与交互", category: "HTML/原型", description: "支持原型选中、修改建议与影响范围分析。", source: "uploadedFile.htmlPreviews/imagePreviews", downstreamImpacts: ["development", "testing", "release", "archive"] },
  { id: "design-spec", stage: "interaction", title: "设计规范", category: "设计规范", description: "沉淀布局规则、颜色、字体、状态与响应式要求。", source: "changeControl.uxArtifacts", downstreamImpacts: ["development", "testing", "release", "archive"] },
  { id: "technical-architecture", stage: "development", title: "技术架构", category: "技术架构", description: "沉淀模块职责、数据流、接口边界、依赖变化与回滚点。", source: "iteration.architecture", downstreamImpacts: ["testing", "release", "archive"] },
  { id: "api-specification", stage: "development", title: "接口设计", category: "API 契约", description: "沉淀 RESTful/RPC 接口定义、请求响应结构、错误码与鉴权方式。", source: "iteration.apiSpec", downstreamImpacts: ["testing", "release", "archive"] },
  { id: "database-design", stage: "development", title: "数据模型设计", category: "数据模型", description: "沉淀 ER 关系、核心表结构、索引策略与数据迁移方案。", source: "iteration.dataModel", downstreamImpacts: ["testing", "release", "archive"] },
  { id: "frontend-code", stage: "development", title: "前端代码", category: "开发实现", description: "沉淀 TypeScript/React 组件、路由、状态管理与 API 调用层。", source: "iteration.frontendCode", downstreamImpacts: ["testing", "release", "archive"] },
  { id: "backend-code", stage: "development", title: "后端代码", category: "开发实现", description: "沉淀 API 路由、服务层、数据访问层与中间件。", source: "iteration.backendCode", downstreamImpacts: ["testing", "release", "archive"] },
  { id: "test-matrix", stage: "testing", title: "测试矩阵", category: "测试验证", description: "维护执行状态、覆盖率与通过率。", source: "changeControl.generatedTestMatrix", downstreamImpacts: ["release", "archive"] },
  { id: "acceptance-checklist", stage: "testing", title: "验收清单", category: "测试验证", description: "沉淀验收口径与回归关注点。", source: "changeControl.qualityArtifacts", downstreamImpacts: ["release", "archive"] },
  { id: "release-review", stage: "release", title: "发布评审", category: "发布评审", description: "输出 go/caution/block 与回滚策略。", source: "changeControl.lastReleaseReview*", downstreamImpacts: ["archive"] },
  { id: "deployment-plan", stage: "release", title: "部署方案", category: "部署运维", description: "沉淀环境配置、上线步骤、回滚流程、健康检查与监控告警。", source: "iteration.deploymentPlan", downstreamImpacts: ["archive"] },
  { id: "delivery-package", stage: "archive", title: "交付归档", category: "交付归档", description: "沉淀交付文件、评审结论与下迭代继承信息。", source: "qualityArtifacts.materializedFiles", downstreamImpacts: [] },
];

function buildArtifactItem(
  def: ArtifactDef,
  now: string,
  resolveEditCapability: (id: string) => "none" | "rich-text" | "prototype-select"
): IterationArtifactWorkflow["items"][number] {
  return {
    id: def.id,
    stage: def.stage,
    title: def.title,
    category: def.category,
    description: def.description,
    status: "pending",
    gateStatus: "pending",
    inputVersionRef: 0,
    outputVersion: 0,
    stale: false,
    downstreamImpacts: def.downstreamImpacts,
    source: def.source,
    editCapability: resolveEditCapability(def.id),
    summary: "",
    evidence: [],
    draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
    lastConfirmedBy: "",
    lastConfirmedAt: "",
    updatedAt: now
  };
}

export function buildDefaultArtifactWorkflow(now: string, mode: ArtifactWorkflowMode = "generic"): IterationArtifactWorkflow {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const defaultRichTextEditable = new Set(ARTIFACT_DEFINITIONS.filter((d) => d.id !== "prototype-preview").map((d) => d.id));
  const defaultPrototypeSelectable = new Set(["prototype-preview"]);
  const parseArtifactSet = (key: string, fallback: Set<string>) => {
    const raw = processEnv[key]?.trim() || "";
    if (!raw) return fallback;
    const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
    return values.length > 0 ? new Set(values) : fallback;
  };
  const richTextEditableSet = parseArtifactSet("BUILDWISE_EDITABLE_RICH_ARTIFACT_IDS", defaultRichTextEditable);
  const prototypeSelectableSet = parseArtifactSet("BUILDWISE_EDITABLE_PROTOTYPE_ARTIFACT_IDS", defaultPrototypeSelectable);
  const resolveEditCapability = (artifactId: string): "none" | "rich-text" | "prototype-select" => {
    if (prototypeSelectableSet.has(artifactId)) return "prototype-select";
    if (richTextEditableSet.has(artifactId)) return "rich-text";
    return "none";
  };

  const items = ARTIFACT_DEFINITIONS.map((def) => {
    const item = buildArtifactItem(def, now, resolveEditCapability);
    if (def.id === "analysis-report") {
      item.title = resolveAnalysisTitle(mode);
      item.description = resolveAnalysisDescription(mode);
    }
    return item;
  });

  return { activeStage: "clarification", updatedAt: now, items };
}
