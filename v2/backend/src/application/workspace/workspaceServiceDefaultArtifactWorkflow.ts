import type { IterationArtifactWorkflow } from "../../domain/workspace/types";

export function buildDefaultArtifactWorkflow(now: string): IterationArtifactWorkflow {
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
        title: "历史版本分析报告",
        category: "分析报告",
        description: "沉淀历史版本洞察、差异、风险与澄清问题。",
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
