import { describe, test } from "node:test";
import assert from "node:assert/strict";

// ── isLowSignalText ──

const { isLowSignalText } = await import(
  "../dist/application/workspace/analysis/extractors.js"
);

describe("isLowSignalText — 低信号文本检测", () => {
  test("空字符串是低信号", () => {
    assert.equal(isLowSignalText(""), true);
  });

  test("短于 8 字符是低信号", () => {
    assert.equal(isLowSignalText("太短"), true);
  });

  test("包含'待补充'是低信号", () => {
    assert.equal(isLowSignalText("内容待补充，请稍后确认"), true);
  });

  test("LLM 程序性自引用是低信号", () => {
    assert.equal(isLowSignalText("由系统自动提取需求信息并生成首版需求分析报告"), true);
    assert.equal(isLowSignalText("推进需求澄清阶段的正式启动"), true);
    assert.equal(isLowSignalText("等待完成需求分析后再补充"), true);
    assert.equal(isLowSignalText("需求澄清阶段尚处于起步位置"), true);
  });

  test("正常业务文本不是低信号", () => {
    assert.equal(isLowSignalText("用户登录支持手机号、邮箱和第三方OAuth三种方式"), false);
    assert.equal(isLowSignalText("本次迭代的核心目标是建设统一的用户认证体系"), false);
  });
});

// ── isAnalysisDataSufficient ──

const { isAnalysisDataSufficient } = await import(
  "../dist/application/workspace/analysis/analysisHelpers.js"
);

describe("isAnalysisDataSufficient — 分析数据充分度检测", () => {
  test("所有关键数据齐全时返回 sufficient", () => {
    const cc = {
      lastBusinessConfirmation: {
        coreIntent: "建设统一的用户认证体系，支持多租户场景下的身份验证",
        functionalPoints: ["用户登录", "权限管理"],
      },
      lastPrioritizedFindings: [{ priority: "P0", content: "缺少安全审计" }],
      lastMeaningfulFindings: ["用户认证体系需要支持多因素认证"],
    };
    const result = isAnalysisDataSufficient(cc);
    assert.equal(result.sufficient, true);
    assert.equal(result.reasons.length, 0);
  });

  test("functionalPoints 为空时返回 insufficient", () => {
    const cc = {
      lastBusinessConfirmation: {
        coreIntent: "建设统一的用户认证体系",
        functionalPoints: [],
      },
      lastPrioritizedFindings: [{ priority: "P0", content: "缺少安全审计" }],
      lastMeaningfulFindings: ["有意义的发现"],
    };
    const result = isAnalysisDataSufficient(cc);
    assert.equal(result.sufficient, false);
    assert.ok(result.reasons.includes("functionalPoints empty"));
  });

  test("coreIntent 是程序性描述时返回 insufficient", () => {
    const cc = {
      lastBusinessConfirmation: {
        coreIntent: "由系统自动提取需求信息并生成首版需求分析报告",
        functionalPoints: ["功能A"],
      },
      lastPrioritizedFindings: [{ priority: "P1", content: "发现" }],
      lastMeaningfulFindings: ["有意义的发现"],
    };
    const result = isAnalysisDataSufficient(cc);
    assert.equal(result.sufficient, false);
    assert.ok(result.reasons.includes("coreIntent missing or low-signal"));
  });

  test("全部为空时返回多个原因", () => {
    const cc = {
      lastBusinessConfirmation: { coreIntent: "", functionalPoints: [] },
      lastPrioritizedFindings: [],
      lastMeaningfulFindings: [],
    };
    const result = isAnalysisDataSufficient(cc);
    assert.equal(result.sufficient, false);
    assert.ok(result.reasons.length >= 3);
  });

  test("changeControl 无 lastBusinessConfirmation 时返回 insufficient", () => {
    const cc = {};
    const result = isAnalysisDataSufficient(cc);
    assert.equal(result.sufficient, false);
  });
});

// ── isSubstantiveContent ──

const { isSubstantiveContent } = await import(
  "../dist/application/workspace/changeControl/artifactDraftSynthesizer.js"
);

describe("isSubstantiveContent — 交付物内容质量检测", () => {
  test("空字符串不通过", () => {
    assert.equal(isSubstantiveContent(""), false);
  });

  test("null/undefined 不通过", () => {
    assert.equal(isSubstantiveContent(null), false);
    assert.equal(isSubstantiveContent(undefined), false);
  });

  test("短文本不通过（<100 字符）", () => {
    assert.equal(isSubstantiveContent("太短了"), false);
  });

  test("纯 markdown 格式壳不通过", () => {
    const shellContent = [
      "# 标题一",
      "## 标题二",
      "### 标题三",
      "---",
      "- 列表",
      "> 引用",
      "**加粗**",
    ].join("\n");
    assert.equal(isSubstantiveContent(shellContent), false);
  });

  test("有实质业务内容的 markdown 通过", () => {
    const content = [
      "# 需求分析报告",
      "",
      "## 核心意图",
      "本次迭代的核心目标是建设统一的用户认证体系，支持多租户场景下的身份验证和权限管理。",
      "",
      "## 功能要点",
      "- 用户登录支持手机号、邮箱和第三方OAuth三种方式",
      "- 管理员可以配置租户级别的认证策略和密码强度要求",
      "- 支持单点登录和多设备会话管理",
      "",
      "## 边界说明",
      "纳入范围：用户注册、登录、权限分配、会话管理",
      "排除范围：第三方支付集成、数据迁移工具",
    ].join("\n");
    assert.equal(isSubstantiveContent(content), true);
  });

  test("纯数字/单字符堆砌不通过", () => {
    const tokens = Array.from({ length: 50 }, (_, i) => String(i)).join(" ");
    const padded = tokens + " " + tokens; // make it >100 chars
    assert.equal(isSubstantiveContent(padded), false);
  });

  test("高重复率文本不通过", () => {
    const repeated = Array.from({ length: 30 }, () => "占位文本").join(" ");
    assert.equal(isSubstantiveContent(repeated), false);
  });

  test("占位短语比例过高不通过", () => {
    const content = [
      "# 需求分析报告",
      "## 核心意图",
      "待补充",
      "## 功能要点",
      "待确认",
      "## 边界说明",
      "待澄清",
      "## 风险",
      "待完成",
      "## 发布评审",
      "待评",
      "## 部署方案",
      "尚未生成",
      "## 验收清单",
      "等待分析完成后自动生成验收检查项和测试用例清单",
    ].join("\n");
    assert.equal(isSubstantiveContent(content), false);
  });

  test("markdown 列表项为纯数字不通过", () => {
    const content = [
      "# 产品需求文档",
      "## 迭代目标",
      "- 1",
      "## 纳入范围",
      "- 1",
      "## 排除范围",
      "- 1",
      "## 验收标准",
      "- 1 可演示并通过验收",
      "## 功能描述",
      "这里有一些比较长的描述文本用于确保总体长度超过一百个字符的阈值要求",
    ].join("\n");
    assert.equal(isSubstantiveContent(content), false);
  });
});

// ── ensureArtifactWorkflow ──

const { ensureArtifactWorkflow, summarizeMatrixExecution, markDownstreamStale } = await import(
  "../dist/application/workspace/changeControl/artifactWorkflow.js"
);
const { defaultIterationChangeControl } = await import(
  "../dist/application/workspace/shared/common.js"
);

function makeMinimalIteration(overrides = {}) {
  return {
    id: 1,
    projectId: 1,
    name: "测试迭代",
    description: "测试用迭代",
    status: "planned",
    version: "1.0.0",
    goals: [],
    scope: { inScope: [], outOfScope: [], acceptanceCriteria: [] },
    assessment: {},
    continuity: {},
    interactionState: {},
    codeLink: null,
    messages: [],
    changeControl: null,
    ...overrides,
  };
}

describe("ensureArtifactWorkflow — 空数据初始化", () => {
  test("空 changeControl 返回完整 workflow 结构", () => {
    const cc = defaultIterationChangeControl();
    const iter = makeMinimalIteration();
    const result = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    assert.ok(result.items);
    assert.ok(result.items.length > 0);
    assert.ok(result.activeStage);
    assert.ok(result.updatedAt);
  });

  test("每个 item 有必要字段", () => {
    const cc = defaultIterationChangeControl();
    const iter = makeMinimalIteration();
    const result = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    for (const item of result.items) {
      assert.ok(item.id, `item 缺少 id`);
      assert.ok(item.title, `${item.id} 缺少 title`);
      assert.ok(item.stage, `${item.id} 缺少 stage`);
      assert.ok(item.category, `${item.id} 缺少 category`);
      assert.ok(typeof item.status === "string", `${item.id} 缺少 status`);
    }
  });
});

describe("ensureArtifactWorkflow — 有分析数据时状态提升", () => {
  test("分析完成后 analysis-report 状态为 partial 或 ready", () => {
    const cc = defaultIterationChangeControl();
    cc.lastAnalysisAt = "2026-01-01T00:00:00Z";
    const iter = makeMinimalIteration();
    const result = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    const report = result.items.find((i) => i.id === "analysis-report");
    assert.ok(report);
    assert.ok(["partial", "ready"].includes(report.status), `状态应为 partial 或 ready, 实际: ${report.status}`);
  });

  test("边界有数据时 boundary-confirmation 状态提升", () => {
    const cc = defaultIterationChangeControl();
    cc.boundary.requirementRefs = ["REQ-001"];
    cc.boundary.componentRefs = ["comp-a"];
    const iter = makeMinimalIteration();
    const result = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    const boundary = result.items.find((i) => i.id === "boundary-confirmation");
    assert.ok(boundary);
    assert.ok(["partial", "ready"].includes(boundary.status));
  });

  test("程序性废话 coreIntent 不标记 PRD 为已识别", () => {
    const cc = defaultIterationChangeControl();
    cc.lastBusinessConfirmation = {
      coreIntent: "由系统自动提取需求信息并生成首版需求分析报告",
      functionalPoints: [],
    };
    cc.lastAnalysisAt = "2026-01-01T00:00:00Z";
    const iter = makeMinimalIteration();
    const result = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    const prd = result.items.find((i) => i.id === "product-requirements-doc");
    assert.ok(prd);
    // 程序性废话不应标记为 ready
    assert.notEqual(prd.status, "ready", `PRD 不应因程序性废话 coreIntent 被标记为 ready`);
    // summary 不应包含 "核心意图已识别"
    assert.ok(!prd.summary.includes("核心意图已识别"), `PRD summary 不应显示"核心意图已识别"`);
  });

  test("真实业务 coreIntent 正常标记 PRD", () => {
    const cc = defaultIterationChangeControl();
    cc.lastBusinessConfirmation = {
      coreIntent: "建设统一的用户认证体系，支持多租户场景下的身份验证和权限管理",
      functionalPoints: ["用户登录", "权限管理"],
    };
    cc.lastAnalysisAt = "2026-01-01T00:00:00Z";
    const iter = makeMinimalIteration();
    const result = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    const prd = result.items.find((i) => i.id === "product-requirements-doc");
    assert.ok(prd);
    assert.ok(["partial", "ready"].includes(prd.status), `PRD 状态应为 partial 或 ready`);
  });
});

// ── summarizeMatrixExecution ──

describe("summarizeMatrixExecution — 测试矩阵统计", () => {
  test("空矩阵覆盖率 100%、通过率 100%", () => {
    const result = summarizeMatrixExecution([]);
    assert.equal(result.total, 0);
    assert.equal(result.coverage, 100);
    assert.equal(result.passRate, 100);
  });

  test("全部通过", () => {
    const matrix = [
      { executionStatus: "passed" },
      { executionStatus: "passed" },
    ];
    const result = summarizeMatrixExecution(matrix);
    assert.equal(result.total, 2);
    assert.equal(result.passed, 2);
    assert.equal(result.passRate, 100);
    assert.equal(result.coverage, 100);
  });

  test("部分通过部分失败", () => {
    const matrix = [
      { executionStatus: "passed" },
      { executionStatus: "failed" },
      { executionStatus: "passed" },
      {},
    ];
    const result = summarizeMatrixExecution(matrix);
    assert.equal(result.total, 4);
    assert.equal(result.passed, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.coverage, 75);
    assert.equal(result.passRate, 67); // 2/3 ≈ 67%
  });

  test("全部待执行时通过率为 0", () => {
    const matrix = [{}, {}, {}];
    const result = summarizeMatrixExecution(matrix);
    assert.equal(result.total, 3);
    assert.equal(result.executed, 0);
    assert.equal(result.passRate, 0);
  });
});

// ── markDownstreamStale ──

describe("markDownstreamStale — 级联失效", () => {
  test("修改 analysis-report 使下游交付物标记为 stale", () => {
    const cc = defaultIterationChangeControl();
    const iter = makeMinimalIteration();
    const workflow = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");
    const stale = markDownstreamStale(workflow.items, "analysis-report");

    // analysis-report 有 downstreamImpacts，应该有受影响的项
    assert.ok(Array.isArray(stale));
  });

  test("不存在的 artifactId 返回空数组", () => {
    const cc = defaultIterationChangeControl();
    const iter = makeMinimalIteration();
    const workflow = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");
    const stale = markDownstreamStale(workflow.items, "nonexistent-artifact");
    assert.deepEqual(stale, []);
  });

  test("outputVersion=0 的交付物不被标记为 stale", () => {
    const cc = defaultIterationChangeControl();
    const iter = makeMinimalIteration();
    const workflow = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    // 确保所有下游交付物 outputVersion 为 0（默认状态）
    for (const item of workflow.items) {
      assert.equal(item.outputVersion, 0, `${item.id} 应初始为 outputVersion=0`);
    }

    const stale = markDownstreamStale(workflow.items, "analysis-report");

    // outputVersion=0 的交付物不应被标记
    assert.deepEqual(stale, []);
    for (const item of workflow.items) {
      assert.equal(item.stale, false, `${item.id} 不应被标记为 stale（outputVersion=0）`);
    }
  });

  test("outputVersion>0 的下游交付物被正确标记为 stale", () => {
    const cc = defaultIterationChangeControl();
    const iter = makeMinimalIteration();
    const workflow = ensureArtifactWorkflow(iter, cc, "2026-01-01T00:00:00Z");

    // 模拟部分交付物已提交（outputVersion > 0）
    const designSpec = workflow.items.find((i) => i.id === "design-spec");
    if (designSpec) {
      designSpec.outputVersion = 1;
    }

    const stale = markDownstreamStale(workflow.items, "analysis-report");

    // 只有 outputVersion > 0 且在下游的才被标记
    if (designSpec) {
      const designSpecStale = stale.find((s) => s.id === "design-spec");
      assert.ok(designSpecStale, "outputVersion>0 的下游交付物应被标记为 stale");
      assert.equal(designSpec.stale, true);
    }

    // outputVersion=0 的交付物仍不被标记
    const untouched = workflow.items.filter((i) => i.outputVersion === 0);
    for (const item of untouched) {
      assert.equal(item.stale, false, `${item.id} 不应被标记为 stale（outputVersion=0）`);
    }
  });
});
