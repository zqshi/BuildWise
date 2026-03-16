import type { IterationArtifactWorkflow } from "../../domain/workspace/types";

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

export function buildDefaultArtifactWorkflow(now: string, mode: ArtifactWorkflowMode = "generic"): IterationArtifactWorkflow {
  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const defaultRichTextEditable = new Set([
    "analysis-report",
    "boundary-confirmation",
    "code-delivery",
    "test-matrix",
    "acceptance-checklist",
    "release-review",
    "delivery-package"
  ]);
  const defaultPrototypeSelectable = new Set(["prototype-preview"]);
  const parseArtifactSet = (key: string, fallback: Set<string>) => {
    const raw = processEnv[key]?.trim() || "";
    if (!raw) return fallback;
    const values = raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? new Set(values) : fallback;
  };
  const richTextEditableSet = parseArtifactSet("BUILDWISE_EDITABLE_RICH_ARTIFACT_IDS", defaultRichTextEditable);
  const prototypeSelectableSet = parseArtifactSet("BUILDWISE_EDITABLE_PROTOTYPE_ARTIFACT_IDS", defaultPrototypeSelectable);
  const resolveEditCapability = (artifactId: string): "none" | "rich-text" | "prototype-select" => {
    if (prototypeSelectableSet.has(artifactId)) return "prototype-select";
    if (richTextEditableSet.has(artifactId)) return "rich-text";
    return "none";
  };

  return {
    activeStage: "clarification",
    updatedAt: now,
    items: [
      {
        id: "analysis-report",
        stage: "clarification",
        title: resolveAnalysisTitle(mode),
        category: "分析报告",
        description: resolveAnalysisDescription(mode),
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["scope", "interaction", "development", "testing", "release", "archive"],
        source: "analysisReport",
        editCapability: resolveEditCapability("analysis-report"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "product-requirements-doc",
        stage: "clarification",
        title: "产品需求文档",
        category: "PRD",
        description: "沉淀问题定义、用户场景、功能需求、非功能要求与验收标准。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["scope", "interaction", "development", "testing", "release", "archive"],
        source: "analysisReport.prd",
        editCapability: resolveEditCapability("product-requirements-doc"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "boundary-confirmation",
        stage: "scope",
        title: "边界确认",
        category: "范围定义",
        description: "定义 requirement/component/codePath 边界。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["interaction", "development", "testing", "release", "archive"],
        source: "changeControl.boundary",
        editCapability: resolveEditCapability("boundary-confirmation"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "prototype-preview",
        stage: "interaction",
        title: "原型与交互",
        category: "HTML/原型",
        description: "支持原型选中、修改建议与影响范围分析。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["development", "testing", "release", "archive"],
        source: "uploadedFile.htmlPreviews/imagePreviews",
        editCapability: resolveEditCapability("prototype-preview"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "design-spec",
        stage: "interaction",
        title: "设计规范",
        category: "设计规范",
        description: "沉淀布局规则、颜色、字体、状态与响应式要求。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["development", "testing", "release", "archive"],
        source: "changeControl.uxArtifacts",
        editCapability: resolveEditCapability("design-spec"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "technical-architecture",
        stage: "development",
        title: "技术架构",
        category: "技术架构",
        description: "沉淀模块职责、数据流、接口边界、依赖变化与回滚点。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["testing", "release", "archive"],
        source: "iteration.architecture",
        editCapability: resolveEditCapability("technical-architecture"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "code-delivery",
        stage: "development",
        title: "代码交付",
        category: "开发实现",
        description: "沉淀分支/提交/PR/路径映射。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["testing", "release", "archive"],
        source: "iteration.codeLink",
        editCapability: resolveEditCapability("code-delivery"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "test-matrix",
        stage: "testing",
        title: "测试矩阵",
        category: "测试验证",
        description: "维护执行状态、覆盖率与通过率。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["release", "archive"],
        source: "changeControl.generatedTestMatrix",
        editCapability: resolveEditCapability("test-matrix"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "acceptance-checklist",
        stage: "testing",
        title: "验收清单",
        category: "测试验证",
        description: "沉淀验收口径与回归关注点。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["release", "archive"],
        source: "changeControl.qualityArtifacts",
        editCapability: resolveEditCapability("acceptance-checklist"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "release-review",
        stage: "release",
        title: "发布评审",
        category: "发布评审",
        description: "输出 go/caution/block 与回滚策略。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: ["archive"],
        source: "changeControl.lastReleaseReview*",
        editCapability: resolveEditCapability("release-review"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      },
      {
        id: "delivery-package",
        stage: "archive",
        title: "交付归档",
        category: "交付归档",
        description: "沉淀交付文件、评审结论与下迭代继承信息。",
        status: "pending",
        gateStatus: "pending",
        inputVersionRef: 0,
        outputVersion: 0,
        stale: false,
        downstreamImpacts: [],
        source: "qualityArtifacts.materializedFiles",
        editCapability: resolveEditCapability("delivery-package"),
        summary: "",
        evidence: [],
        draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
        lastConfirmedBy: "",
        lastConfirmedAt: "",
        updatedAt: now
      }
    ]
  };
}
