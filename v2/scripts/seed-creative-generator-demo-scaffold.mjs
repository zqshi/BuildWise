#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd(), "backend");
const DATA_FILES = [resolve(ROOT, "data.json"), resolve(ROOT, "data.runtime.json")];
const NOW = new Date().toISOString();
const PROJECT_NAME = "创意生成器演示项目";
const PROJECT_DESCRIPTION = "用于验证创意生成器在真实 LLM 驱动、交付物确认、业务规则关联和双版本继承下的完整闭环。";
const DEMO_PHONE = "13800138000";

function createArtifact(id, stage, title, category, description, source, editCapability, downstreamImpacts) {
  return {
    id,
    stage,
    title,
    category,
    description,
    status: "pending",
    gateStatus: "pending",
    inputVersionRef: 0,
    outputVersion: 0,
    stale: false,
    downstreamImpacts,
    source,
    editCapability,
    summary: "",
    evidence: [],
    draft: { content: "", media: [], updatedAt: "", updatedBy: "" },
    lastConfirmedBy: "",
    lastConfirmedAt: "",
    updatedAt: NOW
  };
}

function createArtifactWorkflow(mode) {
  const analysisTitle = mode === "first" ? "首版需求分析报告" : "继承差异分析报告";
  const analysisDescription =
    mode === "first" ? "沉淀首版目标理解、业务对象、纳入项、排除项与待确认问题。" : "沉淀 V1 继承基线、本轮增量差异、业务规则变化与影响边界。";
  return {
    activeStage: "clarification",
    updatedAt: NOW,
    items: [
      createArtifact("analysis-report", "clarification", analysisTitle, "分析报告", analysisDescription, "analysisReport", "rich-text", [
        "scope",
        "interaction",
        "development",
        "testing",
        "release",
        "archive"
      ]),
      createArtifact(
        "product-requirements-doc",
        "clarification",
        "产品需求文档",
        "PRD",
        "沉淀问题定义、用户场景、功能需求、非功能要求与验收标准。",
        "analysisReport.prd",
        "rich-text",
        ["scope", "interaction", "development", "testing", "release", "archive"]
      ),
      createArtifact("boundary-confirmation", "scope", "边界确认", "范围定义", "定义 requirement/component/codePath 边界。", "changeControl.boundary", "rich-text", [
        "interaction",
        "development",
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("prototype-preview", "interaction", "原型与交互", "HTML/原型", "支持原型选中、修改建议与影响范围分析。", "uploadedFile.htmlPreviews/imagePreviews", "prototype-select", [
        "development",
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("design-spec", "interaction", "设计规范", "设计规范", "沉淀布局规则、颜色、字体、状态与响应式要求。", "changeControl.uxArtifacts", "rich-text", [
        "development",
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("technical-architecture", "development", "技术架构", "技术架构", "沉淀模块职责、数据流、接口边界、依赖变化与回滚点。", "iteration.architecture", "rich-text", [
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("api-specification", "development", "接口设计", "API 契约", "沉淀 RESTful/RPC 接口定义、请求响应结构、错误码与鉴权方式。", "iteration.apiSpec", "rich-text", [
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("database-design", "development", "数据模型设计", "数据模型", "沉淀 ER 关系、核心表结构、索引策略与数据迁移方案。", "iteration.dataModel", "rich-text", [
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("frontend-code", "development", "前端代码", "开发实现", "沉淀 TypeScript/React 组件、路由、状态管理与 API 调用层。", "iteration.frontendCode", "rich-text", [
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("backend-code", "development", "后端代码", "开发实现", "沉淀 API 路由、服务层、数据访问层与中间件。", "iteration.backendCode", "rich-text", [
        "testing",
        "release",
        "archive"
      ]),
      createArtifact("test-matrix", "testing", "测试矩阵", "测试验证", "维护增量测试与回归测试执行结果。", "changeControl.generatedTestMatrix", "rich-text", [
        "release",
        "archive"
      ]),
      createArtifact("acceptance-checklist", "testing", "验收清单", "测试验证", "沉淀业务验收口径与上线前确认项。", "changeControl.qualityArtifacts", "rich-text", [
        "release",
        "archive"
      ]),
      createArtifact("release-review", "release", "发布评审", "发布评审", "输出 go/caution/block 结论与回滚策略。", "changeControl.lastReleaseReview*", "rich-text", [
        "archive"
      ]),
      createArtifact("deployment-plan", "release", "部署方案", "部署运维", "沉淀环境配置、上线步骤、回滚流程、健康检查与监控告警。", "iteration.deploymentPlan", "rich-text", [
        "archive"
      ]),
      createArtifact("delivery-package", "archive", "交付归档", "交付归档", "归档版本结论、物料与下版本继承基线。", "qualityArtifacts.materializedFiles", "rich-text", [])
    ]
  };
}

function createChangeControl(mode) {
  const first = mode === "first";
  return {
    pendingHumanConfirmation: false,
    lastAnalysisAt: "",
    lastAnalysisFileName: first ? "docs/creative-generator-demo-requirement.md" : "docs/creative-generator-v1.1-delta.md",
    lastAnalysisDigest: "",
    lastUploadedInputFingerprint: first ? "creative-generator-v1" : "creative-generator-v1.1",
    lastUploadedAt: NOW,
    lastFailedAnalysisInput: "",
    lastFailedAnalysisAt: "",
    lastFailedAnalysisError: "",
    lastAttachmentUploadId: "",
    lastAttachmentIngestJobId: "",
    lastAttachmentAnalysisJobId: "",
    lastAttachmentReportId: "",
    clarificationRounds: 0,
    clarificationQuestions: [],
    clarificationDraftResolvedQuestions: [],
    clarificationDraftUpdatedAt: "",
    lastClarificationResolution: { resolvedQuestions: [], unresolvedQuestions: [], updatedAt: "" },
    lastClarificationNote: "",
    confirmedAt: "",
    confirmedBy: "",
    generatedTestMatrix: [],
    generatedTestMatrixUpdatedAt: "",
    testMatrixExecutionUpdatedAt: "",
    qualityArtifacts: { unitTests: [], contractTests: [], acceptanceChecklist: [], regressionPoints: [], materializedFiles: [], updatedAt: "" },
    uxArtifacts: { informationArchitecture: [], interactionFlows: [], uiStates: [], uxConstraints: [], updatedAt: "" },
    executableConstraints: { componentWhitelist: [], codePathWhitelist: [], acceptanceChecks: [], generatedAt: "" },
    traceabilitySnapshot: { requirementCoverage: 0, mappingConfidence: "low", unmappedRequirements: [], conflicts: [], generatedAt: "" },
    domainKnowledgeEntries: [],
    domainKnowledgeUpdatedAt: "",
    lastAnalysisP0Count: 0,
    lastAnalysisHighValueCount: 0,
    lastAnalysisConsideredFiles: 0,
    lastAnalysisIgnoredFiles: 0,
    lastAnalysisIgnoredFileRatio: 0,
    lastReleaseReviewDecision: "",
    lastReleaseReviewReason: "",
    lastReleaseReviewBlockers: [],
    lastReleaseReviewScore: 0,
    lastReleaseReviewUpdatedAt: "",
    lastTraceabilityCoverageScore: 0,
    lastOpsRollbackSuggested: false,
    lastReportPublishable: false,
    lastReportQualityScore: 0,
    lastReportQualitySummary: "",
    lastReportQualityUpdatedAt: "",
    artifactWorkflow: createArtifactWorkflow(mode),
    boundary: { requirementRefs: [], componentRefs: [], codePaths: [], note: "", updatedAt: "" },
    changeSource: {
      type: "document",
      rawInput: first ? "创意生成器首版需求文档" : "创意生成器 V1.1 业务规则与增量需求说明",
      attachments: [first ? "docs/creative-generator-demo-requirement.md" : "docs/creative-generator-v1.1-delta.md"],
      references: first ? [] : ["baseline/v1.0.0"],
      updatedAt: NOW
    },
    knowledgeHits: [],
    knowledgeConflicts: [],
    normalizedFunctionalPoints: first ? ["主题输入", "创意生成", "详情抽屉"] : ["业务规则注入", "品牌语气规则", "禁用词过滤", "历史记录筛选"],
    mappingAuditTrail: []
  };
}

function buildStore() {
  const project = {
    id: 1,
    name: PROJECT_NAME,
    description: PROJECT_DESCRIPTION,
    status: "in-progress",
    icon: "sparkles",
    iconColor: "blue",
    lastUpdated: NOW.slice(0, 10),
    repository: {
      id: "repo-1",
      repoMode: "hybrid",
      provider: "github",
      organization: "buildwise",
      name: "creative-generator-demo",
      url: "https://github.com/buildwise/creative-generator-demo",
      defaultBranch: "main",
      structureVersion: "v1",
      layout: [
        { path: "apps/web", purpose: "前端应用", required: true },
        { path: "apps/api", purpose: "后端服务", required: true },
        { path: "docs", purpose: "流程与业务说明", required: true },
        { path: "tests", purpose: "质量验证", required: true }
      ],
      remote: {
        status: "provisioned",
        visibility: "private",
        ownerType: "org",
        providerRepoId: "bw-creative-demo",
        htmlUrl: "https://github.com/buildwise/creative-generator-demo",
        cloneUrl: "https://github.com/buildwise/creative-generator-demo.git",
        sshUrl: "git@github.com:buildwise/creative-generator-demo.git",
        lastProvisionedAt: NOW
      },
      governance: { requireRemoteForProduction: true, requireRemoteForStaging: false },
      health: { remoteConfigured: true, remoteReachable: true, remoteSynced: true, lastCheckedAt: NOW, lastError: "" },
      createdAt: NOW,
      updatedAt: NOW,
      workspace: { rootPath: "", repoPath: "", gitInitialized: false, lastScaffoldedAt: "" }
    },
    knowledgeBase: {
      ontologyTerms: [
        { term: "创意主题", aliases: ["主题词"], definition: "驱动创意生成的核心输入。", evidence: "v1 seed" },
        { term: "品牌语气规则", aliases: ["语气规则"], definition: "用于约束生成结果的品牌表达风格。", evidence: "v1.1 delta" }
      ],
      stableRules: [
        { rule: "交付物先确认后继续推进。", rationale: "避免多环节一次性输出。", source: "creative-generator-demo" },
        { rule: "详情信息默认通过右侧抽屉查看。", rationale: "保持主任务流连续。", source: "creative-generator-demo" },
        { rule: "业务规则通过自然语言灌入，不要求业务人员编辑代码。", rationale: "让业务人员聚焦领域知识而非研发实现。", source: "creative-generator-demo" }
      ],
      componentInventory: [],
      codeMap: [],
      decisionLog: [],
      knownRisks: [],
      changePatterns: [
        { pattern: "首版先完成核心生成闭环，后续版本再引入业务规则增强", preferredFlow: "analysis->boundary->prototype->code->test->release", avoid: "同时引入过多协作能力" }
      ],
      updatedAt: NOW
    }
  };

  const v1 = {
    id: 1,
    projectId: 1,
    version: "1.0.0",
    name: "V1 首版本：创意生成器 MVP",
    description: "创意生成器首版本，从需求分析到发布归档建立首版产品基线。",
    goals: ["完成创意生成器首版闭环", "建立后续业务规则增强的继承基线"],
    modules: [
      { id: "m1-1", title: "需求分析与边界确认", status: "planned" },
      { id: "m1-2", title: "原型、实现、测试与发布", status: "planned" }
    ],
    status: "in-progress",
    progress: 8,
    createdAt: "2026-03-16",
    createdBy: "系统",
    current: false,
    aiSummary: "创意生成器首版本，优先验证单页生成与交付物确认闭环。",
    scope: {
      inScope: ["主题输入", "创意生成", "详情抽屉", "收藏与再次生成"],
      outOfScope: ["移动端", "审批流", "外部平台直发"],
      acceptanceCriteria: ["单页完成输入到生成闭环", "交付物确认流程可用", "原型与代码视图可用"]
    },
    continuity: {
      inheritedFromIterationId: null,
      inheritedSummary: "首个版本，无继承基线。",
      carriedGoals: [],
      carriedRisks: [],
      carriedDecisions: []
    },
    assessment: {
      baselineIterationId: null,
      baselineIterationName: "无基线",
      currentSummary: "等待首版分析和交付物生成。",
      deltaInScope: ["创意主题输入", "多组创意生成", "右侧详情抽屉"],
      resolvedItems: [],
      pendingItems: ["目标确认", "边界确认", "原型确认", "实现方案", "测试与发布"],
      risks: []
    },
    interactionState: {
      hasPrototypeAssets: false,
      uploadKind: "documents",
      lastUpdatedAt: NOW,
      lastAttachmentName: "docs/creative-generator-demo-requirement.md",
      gitRequirementIntake: {
        status: "declined",
        askedAt: NOW,
        decidedAt: NOW,
        branch: "main",
        repoUrl: "https://github.com/buildwise/creative-generator-demo",
        summary: "本轮直接基于需求文档推进，不先读取仓库。",
        error: ""
      }
    },
    changeControl: createChangeControl("first"),
    codeLink: {
      repoId: "repo-1",
      branch: "iteration/1-v1-creative-generator-mvp",
      tag: "v1.0.0",
      commit: "",
      pr: "",
      paths: [],
      note: "",
      linkedAt: NOW
    }
  };

  const v11 = {
    id: 2,
    projectId: 1,
    version: "1.1.0",
    name: "V1.1 后续版本：业务规则注入与历史筛选",
    description: "在 V1 基线之上增加业务规则注入、品牌语气规则、禁用词过滤和历史记录筛选。",
    goals: ["完成业务规则增强闭环", "验证业务人员通过自然语言灌入规则的可控性"],
    modules: [
      { id: "m2-1", title: "继承差异与业务规则关联", status: "planned" },
      { id: "m2-2", title: "规则增强实现、测试与发布", status: "planned" }
    ],
    status: "planned",
    progress: 0,
    createdAt: "2026-03-16",
    createdBy: "系统",
    current: true,
    aiSummary: "V1.1 继承 V1 基线，聚焦业务规则注入和历史记录筛选。",
    scope: {
      inScope: ["品牌语气规则注入", "禁用词规则注入", "历史记录筛选", "业务规则与工程对象关联"],
      outOfScope: ["协作审批流", "多角色权限", "外部发布集成"],
      acceptanceCriteria: ["规则可以通过自然语言灌入", "规则命中页面/组件/API/测试有追踪", "不破坏 V1 核心生成主路径"]
    },
    continuity: {
      inheritedFromIterationId: 1,
      inheritedSummary: "继承 V1 的主题输入、创意生成、详情抽屉与收藏主路径。",
      carriedGoals: ["保持单页创意生成闭环"],
      carriedRisks: ["规则注入可能影响现有生成结果一致性"],
      carriedDecisions: ["交付物仍需先确认后推进"]
    },
    assessment: {
      baselineIterationId: 1,
      baselineIterationName: "V1 首版本：创意生成器 MVP",
      currentSummary: "等待继承差异确认和业务规则映射生成。",
      deltaInScope: ["品牌语气规则", "禁用词规则", "历史记录筛选"],
      resolvedItems: ["读取 V1 基线"],
      pendingItems: ["继承差异分析", "规则映射", "实现方案", "测试与发布"],
      risks: ["业务规则可能与当前生成逻辑冲突", "规则未映射到测试会导致质量门禁失真"]
    },
    interactionState: {
      hasPrototypeAssets: false,
      uploadKind: "mixed",
      lastUpdatedAt: NOW,
      lastAttachmentName: "docs/creative-generator-v1.1-delta.md",
      gitRequirementIntake: {
        status: "declined",
        askedAt: NOW,
        decidedAt: NOW,
        branch: "main",
        repoUrl: "https://github.com/buildwise/creative-generator-demo",
        summary: "后续版本先基于 V1 基线和增量规则说明推进，不先读取仓库。",
        error: ""
      }
    },
    changeControl: createChangeControl("subsequent"),
    codeLink: {
      repoId: "repo-1",
      branch: "iteration/2-v1.1-business-rule-linking",
      tag: "v1.1.0",
      commit: "",
      pr: "",
      paths: [],
      note: "",
      linkedAt: NOW
    }
  };

  return {
    projects: [project],
    iterations: [v1, v11],
    messages: [],
    snapshots: [
      {
        id: 1,
        iterationId: 1,
        source: "create",
        note: "创意生成器 V1 初始化快照",
        assessment: v1.assessment,
        scope: v1.scope,
        status: v1.status,
        progress: v1.progress,
        createdAt: NOW
      },
      {
        id: 2,
        iterationId: 2,
        source: "create",
        note: "创意生成器 V1.1 初始化快照",
        assessment: v11.assessment,
        scope: v11.scope,
        status: v11.status,
        progress: v11.progress,
        createdAt: NOW
      }
    ],
    transitions: [],
    auditLogs: [],
    versionSnapshots: [],
    projectShares: [],
    deployments: [],
    templateRuns: [],
    opsTriageTemplates: [],
    mockContracts: [
      {
        key: "creative-generator-demo",
        description: "只保留创意生成器双版本，供真实 LLM 与 browser-use 全流程验证。",
        currentVersion: "2026-03-16",
        requiredIterations: ["V1 首版本：创意生成器 MVP", "V1.1 后续版本：业务规则注入与历史筛选"]
      }
    ],
    projectPolicies: [
      {
        id: 1,
        projectId: 1,
        version: 1,
        status: "active",
        strategy: {
          stages: ["clarification", "scope", "interaction", "development", "testing", "release", "archive"],
          gates: [
            { stage: "scope", requiredArtifacts: ["analysis-report", "product-requirements-doc"], requireHumanConfirmation: true },
            { stage: "development", requiredArtifacts: ["boundary-confirmation", "prototype-preview", "design-spec"], requireHumanConfirmation: true },
            { stage: "release", requiredArtifacts: ["test-matrix", "acceptance-checklist", "release-review"], requireHumanConfirmation: true }
          ],
          requiredConfirmations: { firstIterationBaseline: true, followUpRollbackDecision: true },
          exceptions: [{ key: "quality_contract_failed", fallbackAction: "repair-before-progress", requireUserDecision: true }],
          skillsPlan: [{ stage: "agent-selected", skills: ["10-business-rule-linking", "11-product-rd-quality-contract"] }]
        },
        createdBy: "owner",
        approvedBy: "owner",
        createdAt: NOW,
        approvedAt: NOW
      }
    ],
    projectWorkspaceBindings: [
      {
        id: 1,
        projectId: 1,
        openclawProfile: "buildwise-local",
        agentId: "main",
        workspacePath: "/Users/zqs/Downloads/project/BuildWise",
        runtimeMode: "openclaw-native",
        locked: false,
        createdBy: "system",
        createdAt: NOW,
        updatedAt: NOW
      }
    ],
    policyExecutionLogs: [],
    projectRoleBindings: [
      {
        projectId: 1,
        userId: DEMO_PHONE,
        role: "owner",
        createdAt: NOW,
        updatedAt: NOW
      }
    ],
    platformRoleBindings: [
      {
        userId: DEMO_PHONE,
        role: "admin",
        createdAt: NOW,
        updatedAt: NOW
      }
    ],
    governanceCustomRoles: []
  };
}

const store = buildStore();
for (const file of DATA_FILES) {
  writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

console.log(JSON.stringify({ ok: true, projectName: PROJECT_NAME, iterations: store.iterations.map((item) => item.name), files: DATA_FILES }, null, 2));
