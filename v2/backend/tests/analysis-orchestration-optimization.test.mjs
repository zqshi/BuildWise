import test from "node:test";
import assert from "node:assert/strict";

import { listDeepInsightsMissingReasons } from "../dist/application/workspace/analysis/deepInsightsOps.js";
import preflightOps from "../dist/application/workspace/analysis/preflightOps.js";
import { buildIterationAgentPlan, shouldUseCompactSingleFileAnalysis } from "../dist/application/workspace/shared/supportAgent.js";
import { buildAttachmentInsights } from "../dist/application/workspace/shared/supportInsights.js";
import { synthesizeProjectProfileOp } from "../dist/application/workspace/analysis/projectProfileRunnerOps.js";
import { synthesizeReleaseReviewOp } from "../dist/application/workspace/analysis/governanceRunnerOps.js";
import {
  synthesizeBusinessConfirmationOp,
  synthesizeGovernanceInsightsOp,
  synthesizeReportQualityGateOp
} from "../dist/application/workspace/analysis/governanceRunnerOps.js";
import { buildGovernanceInsightsPrompt } from "../dist/application/workspace/analysis/governancePromptOps.js";
import { detectGitRequirementReadDecision } from "../dist/application/workspace/coach/gitRequirementIntakeOps.js";

const { resolveExecutionPolicyHeuristically } = preflightOps;

test("execution policy fast-path keeps simple single-file requirement analysis off the llm orchestrator", () => {
  const result = resolveExecutionPolicyHeuristically({
    sourceType: "single-file",
    excerptLength: 6400,
    chunkCount: 1,
    totalFiles: 1,
    binaryFiles: 0,
    forceMultiAgentHint: false
  });
  assert.deepEqual(result, {
    degraded: false,
    reason: "heuristic-simple-single-file",
    enforceSingleAgent: true,
    forceMultiAgent: false,
    promptBudgetRisk: "low"
  });
  assert.equal(
    resolveExecutionPolicyHeuristically({
      sourceType: "folder",
      excerptLength: 6400,
      chunkCount: 1,
      totalFiles: 4,
      binaryFiles: 0,
      forceMultiAgentHint: false
    }),
    null
  );
});

test("git intake leaves long free-text requirement as unknown instead of implicit decline", () => {
  assert.equal(detectGitRequirementReadDecision("我们先做创意生成器第一版，目标是让市场同学能快速产出活动创意并评审"), "unknown");
  assert.equal(detectGitRequirementReadDecision("读取仓库"), "accept");
  assert.equal(detectGitRequirementReadDecision("暂不读取仓库"), "decline");
});

test("agent plan uses compact context for simple single-file textual requirements", () => {
  const plan = buildIterationAgentPlan({
    iteration: {
      id: 1,
      projectId: 1,
      version: "1.0.0",
      name: "V1",
      description: "创意生成器",
      status: "planned",
      goals: [],
      aiSummary: "",
      scope: { inScope: ["创意生成"], outOfScope: [], acceptanceCriteria: ["可生成创意"] },
      changeControl: null
    },
    previous: null,
    scope: "iteration",
    diffLocations: [],
    risks: [],
    fileName: "creative-generator-demo-requirement.md",
    attachmentMeta: {
      strategy: "direct",
      digest: "demo",
      textPreview: "创意生成器首版需求，聚焦创意模板、生成、评分与历史记录。"
    },
    attachmentSignals: {
      sourceType: "single-file",
      hasPrototypeEvidence: false,
      hasDocumentEvidence: true,
      totalFiles: 1
    }
  });
  assert.equal(plan.prompts[0].role, "requirements-analyst");
  // contextMode=compact-single-file 标记已被 b12dbb9 重构移除，compact 模式现通过 role(agent-requirements-analyst-compact-1) 与 expectedOutput 区分
  assert.equal(plan.prompts[0].userPrompt.includes("skillsRoot="), false);
  assert.equal(plan.prompts[0].expectedOutput.includes("stagePlan"), false);
});

test("compact single-file detection skips heavyweight agent-plan execution prerequisites", () => {
  assert.equal(
    shouldUseCompactSingleFileAnalysis({
      attachmentSignals: {
        sourceType: "single-file",
        hasPrototypeEvidence: false,
        hasDocumentEvidence: true,
        totalFiles: 1
      }
    }),
    true
  );
  assert.equal(
    shouldUseCompactSingleFileAnalysis({
      attachmentSignals: {
        sourceType: "single-file",
        hasPrototypeEvidence: true,
        hasDocumentEvidence: true,
        totalFiles: 1
      }
    }),
    false
  );
});

test("single-file attachment insights use local heuristic instead of llm", async () => {
  const result = buildAttachmentInsights({
    iterationName: "创意生成器 V1",
    fileName: "creative-generator-demo-requirement.md",
    excerpt: "创意生成器首版支持主题输入、创意生成、收藏、再次生成和历史记录。",
    mimeType: "text/markdown",
    strategy: "direct",
    versionDiff: { added: ["创意评分"], changed: [], removed: [] },
    diffLocations: [{ dimension: "inScope", changeType: "added", currentItem: "创意评分" }],
    added: ["创意评分"],
    changed: [],
    removed: []
  });
  assert.equal(result.artifactType.length > 0, true);
  assert.equal(result.projectCategory.length > 0, true);
  assert.equal(result.versionChangeSummary.includes("新增"), true);
});

test("deep insights does not force analyzed-only fields on partial files", () => {
  const reasons = listDeepInsightsMissingReasons({
    coverage: {
      consideredFiles: 2,
      analyzedFiles: 1,
      partialFiles: 1,
      failedFiles: 0,
      coveragePercent: 100
    },
    fileInsights: [
      {
        path: "docs/prd.md",
        fileName: "prd.md",
        mimeType: "text/markdown",
        size: 100,
        kind: "document",
        status: "analyzed",
        mainContent: "创意生成器需求说明",
        requiredWork: "产出版本规划",
        iterationValue: "支撑当前迭代",
        summary: "需求完整",
        keyPoints: ["支持活动创意生成"],
        risks: [],
        optimizeItems: [],
        keepItems: [],
        recommendedActions: ["补齐验收标准"],
        openQuestions: [],
        citations: ["docs/prd.md"],
        confidence: "high"
      },
      {
        path: "assets/mockup.png",
        fileName: "mockup.png",
        mimeType: "image/png",
        size: 100,
        kind: "image",
        status: "partial",
        mainContent: "",
        requiredWork: "",
        iterationValue: "",
        summary: "仅能识别部分布局",
        keyPoints: [],
        risks: [],
        optimizeItems: [],
        keepItems: [],
        recommendedActions: [],
        openQuestions: ["需要更清晰原图"],
        citations: ["assets/mockup.png"],
        confidence: "medium"
      }
    ],
    crossFileInsights: {
      themes: ["生成与评审闭环"],
      conflicts: [],
      gaps: [],
      recommendations: ["补齐模型评审节点"],
      conflictChains: [],
      rootCauses: ["需求与视觉稿信息密度不一致"],
      impactScope: ["分析阶段"],
      decisionSuggestions: ["先以文本需求为主"]
    }
  });
  assert(!reasons.includes("fileInsights missing mainContent/requiredWork/iterationValue/recommendedActions"));
});

test("supplemental project profile skips extended repair loops and tolerates missing project identity", async () => {
  const calls = [];
  const runner = {};
  const runAnalysisPrompt = async (_runner, prompt) => {
    calls.push(prompt.agentId);
    return {
      content: JSON.stringify({
        projectDetection: { projectName: "", productName: "", projectCategory: "", evidence: [] },
        meaningfulFindings: ["补充上下文提到活动创意需要人工评审"],
        prioritizedFindings: [{ priority: "P1", content: "评审链路需纳入版本范围", reason: "补充上下文给出了审批节点" }],
        nextActions: ["将审批节点加入流程图"]
      }),
      model: "test-model"
    };
  };
  const result = await synthesizeProjectProfileOp(
    runner,
    {
      iterationName: "v2",
      sourceType: "folder",
      analyzedTarget: "creative-generator",
      excerpt: "补充上下文",
      fileStats: { totalFiles: 5, textFiles: 5, binaryFiles: 0 },
      versionDiff: { added: [], changed: [], removed: [] },
      agentOutputs: [],
      contextLabel: "batch-1",
      contextMode: "supplemental"
    },
    {
      runAnalysisPrompt,
      synthesisLlmConfig: {
        fallbackModels: [],
        repairAttemptsSingleFile: 2,
        repairAttemptsBatch: 4,
        findingsRepairAttempts: 3,
        projectDetectionRepairAttempts: 3
      }
    }
  );
  assert.equal(calls.length <= 2, true);
  assert.equal(calls.some((id) => id.includes("prioritize")), false);
  assert.equal(calls.some((id) => id.includes("findings")), false);
  assert.equal(calls.some((id) => id.includes("project-detection")), false);
  assert.equal(result.projectDetection.projectName, "");
  assert.equal(result.prioritizedFindings.length, 1);
});

test("primary single-file project profile uses compact prompt and calls LLM", async () => {
  const calls = [];
  const result = await synthesizeProjectProfileOp(
    {},
    {
      iterationName: "v1",
      sourceType: "single-file",
      analyzedTarget: "creative-generator",
      excerpt: "创意生成器首版聚焦模板、生成、评分和历史记录。",
      fileStats: { totalFiles: 1, textFiles: 1, binaryFiles: 0 },
      versionDiff: { added: ["创意评分"], changed: [], removed: [] },
      agentOutputs: [{ agentId: "a1", role: "requirements-analyst", status: "success", content: "{\"diff\":{}}" }],
      contextLabel: "primary",
      contextMode: "primary"
    },
    {
      runAnalysisPrompt: async (_runner, prompt) => {
        calls.push({ agentId: prompt.agentId, role: prompt.role, userPrompt: prompt.userPrompt });
        return {
          content: JSON.stringify({
            projectDetection: { projectName: "创意生成器", productName: "创意生成器", projectCategory: "web-app", evidence: ["需求标题"] },
            meaningfulFindings: ["首版聚焦单用户创意生成闭环", "评分结果需要落到历史记录中"],
            prioritizedFindings: [{ priority: "P1", content: "先实现生成闭环", reason: "这是首版主路径" }],
            nextActions: ["定义生成接口", "补齐历史记录结构"]
          }),
          model: "test-model"
        };
      },
      synthesisLlmConfig: {
        fallbackModels: [],
        repairAttemptsSingleFile: 2,
        repairAttemptsBatch: 4,
        findingsRepairAttempts: 3,
        projectDetectionRepairAttempts: 3
      }
    }
  );
  assert.ok(calls.length >= 1, "single-file must call LLM (no heuristic fallback)");
  assert.equal(result.projectDetection.projectName, "创意生成器");
});

test("primary single-file project profile throws when agentRunner is null", async () => {
  await assert.rejects(
    () => synthesizeProjectProfileOp(
      null,
      {
        iterationName: "创意生成器 V1",
        sourceType: "single-file",
        analyzedTarget: "creative-generator-demo-requirement.md",
        excerpt: "创意生成器首版聚焦主题输入、创意生成、收藏、再次生成与历史记录。",
        fileStats: { totalFiles: 1, textFiles: 1, binaryFiles: 0 },
        versionDiff: { added: ["创意评分"], changed: [], removed: [] },
        agentOutputs: [],
        contextLabel: "primary",
        contextMode: "primary"
      },
      {
        runAnalysisPrompt: async () => { throw new Error("should not call llm"); },
        synthesisLlmConfig: {
          fallbackModels: [],
          repairAttemptsSingleFile: 2,
          repairAttemptsBatch: 4,
          findingsRepairAttempts: 3,
          projectDetectionRepairAttempts: 3
        }
      }
    ),
    (err) => {
      assert.ok(err.message.includes("LLM is not configured"), `unexpected: ${err.message}`);
      return true;
    }
  );
});

test("single-file business confirmation throws when agentRunner is null", async () => {
  await assert.rejects(
    () => synthesizeBusinessConfirmationOp(
      null,
      {
        iterationName: "v1",
        baselineIterationName: "无基线",
        analyzedTarget: "creative-generator",
        sourceType: "single-file",
        excerpt: "创意生成器首版需要支持模板、生成、评分和历史记录。",
        requirements: ["创意生成", "创意评分"],
        components: ["生成表单"],
        codePaths: ["src/features/generator.tsx"],
        clarificationQuestions: [],
        versionDiff: { added: ["创意评分"], changed: [], removed: [] },
        diffLocations: [],
        prioritizedFindings: [{ priority: "P1", content: "先打通生成主路径", reason: "首版目标" }]
      },
      {
        runAnalysisPrompt: async () => { throw new Error("should not call llm"); }
      }
    ),
    (err) => {
      assert.ok(err.message.includes("LLM is not configured"), `unexpected: ${err.message}`);
      return true;
    }
  );
});

test("single-file governance prompt uses compact analyst role", () => {
  const prompt = buildGovernanceInsightsPrompt({
    iterationName: "v1",
    baselineIterationName: "无基线",
    sourceType: "single-file",
    excerpt: "创意生成器首版支持模板、生成、评分与历史记录。",
    diffLocations: [],
    added: ["创意评分"],
    changed: [],
    removed: [],
    requirements: ["创意生成"],
    components: ["生成表单"],
    codePaths: ["src/features/generator.tsx"],
    prioritizedFindings: [{ priority: "P1", content: "先打通生成主链路", reason: "首版目标" }],
    clarificationQuestions: []
  });
  assert.equal(prompt.role, "requirements-analyst");
  assert.equal(prompt.userPrompt.includes("1-3 条差异"), true);
});

test("release review falls back to provided recommendations before triggering repair", async () => {
  const calls = [];
  const runner = {};
  const result = await synthesizeReleaseReviewOp(
    runner,
    {
      iterationName: "v2",
      excerpt: "创意生成器版本评审",
      prioritizedFindings: [{ priority: "P1", content: "需要补齐人工审核", reason: "当前链路只有生成没有审核" }],
      blockers: [],
      releaseGates: ["验收清单完成"],
      rollbackPlan: ["回滚到上一个稳定版本"],
      recommendations: ["补齐审核节点再发布"],
      qualitySignals: {
        testCaseCount: 10,
        p0FindingCount: 0,
        unknownSignalCount: 0,
        boundaryCoverage: 90
      }
    },
    {
      runAnalysisPrompt: async (_runner, prompt) => {
        calls.push(prompt.agentId);
        return {
          content: JSON.stringify({
            decision: "caution",
            reason: "",
            score: 78,
            blockers: [],
            releaseGates: [],
            recommendations: [],
            rollback: { shouldRollback: false, reason: "", trigger: "", actions: [] },
            qualitySignals: { testCaseCount: 10, p0FindingCount: 0, unknownSignalCount: 0, boundaryCoverage: 90 }
          }),
          model: "test-model"
        };
      }
    }
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(result.recommendations, ["补齐审核节点再发布"]);
  assert.equal(result.reason.length > 0, true);
});

test("governance insights throws when agentRunner is null", async () => {
  await assert.rejects(
    () => synthesizeGovernanceInsightsOp(
      null,
      {
        iterationName: "v2",
        baselineIterationName: "v1",
        sourceType: "single-file",
        excerpt: "创意生成器新增审核节点与投放建议",
        diffLocations: [{ dimension: "inScope", changeType: "added", currentItem: "人工审核节点" }],
        added: ["人工审核节点"],
        changed: ["投放建议策略"],
        removed: [],
        requirements: ["活动创意生成", "人工审核"],
        components: ["创意表单", "审核面板"],
        codePaths: ["src/features/creative-form.tsx", "src/features/review-panel.tsx"],
        prioritizedFindings: [{ priority: "P1", content: "审核链路需进入发布边界", reason: "否则生成结果不可控" }],
        clarificationQuestions: ["审核人是否支持多人会签"]
      },
      {
        runAnalysisPrompt: async () => { throw new Error("should not call llm"); }
      }
    ),
    (err) => {
      assert.ok(err.message.includes("LLM is not configured"), `unexpected: ${err.message}`);
      return true;
    }
  );
});

test("report quality derives summary and actions from structured evidence when model output is sparse", async () => {
  const calls = [];
  const result = await synthesizeReportQualityGateOp(
    {},
    {
      iterationName: "v2",
      analyzedTarget: "creative-generator",
      sourceType: "single-file",
      deepInsights: {
        coverage: { consideredFiles: 3, analyzedFiles: 2, partialFiles: 1, failedFiles: 0, coveragePercent: 100 },
        fileInsights: [],
        crossFileInsights: {
          themes: ["生成与审核"],
          conflicts: [],
          gaps: [],
          recommendations: ["补齐审核配置"],
          conflictChains: [],
          rootCauses: ["当前流程缺少审核节点"],
          impactScope: ["发布"],
          decisionSuggestions: ["发布前必须补齐人工审核"]
        }
      },
      businessConfirmation: {
        coreIntent: "生成活动创意并完成审核",
        successCriteria: ["市场同学可生成创意", "审核通过后可流转"],
        interactionInsights: { primaryFlow: [], keyInteractions: [], exceptionPaths: [], usabilityRisks: [] },
        necessityAssessment: { mustDo: ["审核"], shouldDo: [], canDefer: [], outOfScope: [], rationale: "降低错误发布风险" },
        evidenceRefs: ["docs/prd.md: 审核要求"],
        boundarySummary: "",
        functionalPoints: [],
        confirmationChecklist: [],
        versionDiffSummary: "",
        diffNarratives: [],
        diffConfirmationOrder: []
      },
      prioritizedFindings: [{ priority: "P1", content: "审核链路缺失", reason: "发布风险高" }],
      clarificationQuestions: []
    },
    {
      runAnalysisPrompt: async (_runner, prompt) => {
        calls.push(prompt.role);
        return {
          content: JSON.stringify({ publishable: false, score: 0, summary: "", missingItems: [], actionRequired: [] }),
          model: "test-model"
        };
      }
    }
  );
  assert.equal(calls[0], "requirements-analyst");
  assert.equal(result.summary.length > 0, true);
  assert.equal(result.score > 0, true);
  assert.equal(result.actionRequired.includes("补充附件或代码路径证据"), false);
});

test("single-file release review uses compact analyst role", async () => {
  const calls = [];
  const result = await synthesizeReleaseReviewOp(
    {},
    {
      iterationName: "v1",
      sourceType: "single-file",
      excerpt: "创意生成器首版发布评审，当前仅覆盖单用户生成闭环。",
      prioritizedFindings: [{ priority: "P1", content: "需补齐审核节点", reason: "避免错误发布" }],
      blockers: [],
      releaseGates: ["验收清单完成"],
      rollbackPlan: ["回滚到上一稳定版本"],
      recommendations: ["补齐审核节点再发布"],
      qualitySignals: {
        testCaseCount: 6,
        p0FindingCount: 0,
        unknownSignalCount: 0,
        boundaryCoverage: 80
      }
    },
    {
      runAnalysisPrompt: async (_runner, prompt) => {
        calls.push(prompt.role);
        return {
          content: JSON.stringify({
            decision: "caution",
            reason: "首版仍需确认审核节点",
            score: 82,
            blockers: [],
            releaseGates: ["验收清单完成"],
            recommendations: ["补齐审核节点再发布"],
            rollback: { shouldRollback: false, reason: "", trigger: "", actions: [] },
            qualitySignals: { testCaseCount: 6, p0FindingCount: 0, unknownSignalCount: 0, boundaryCoverage: 80 }
          }),
          model: "test-model"
        };
      }
    }
  );
  assert.equal(calls[0], "requirements-analyst");
  assert.equal(result.decision, "caution");
});
