/**
 * artifactSynthesisAgentOps — LLM 驱动的交付物合成
 *
 * 核心原则：
 * - 所有交付物内容 100% 由 LLM 生成，无硬编码模板
 * - 每个 artifact 有专属 prompt，包含行业最佳实践结构要求
 * - LLM 评估信息充分度，不足的部分生成澄清问题
 * - agentRunner 不可用时直接报错，不降级
 */

import { LlmUnavailableError, type AgentRunner } from '../shared/agentRunner';
import type { Iteration } from '../../../domain/workspace/types';
import { defaultIterationChangeControl } from '../shared/common';
import { runAnalysisPrompt } from './configOps';
import type { IterationAgentPrompt } from '../../../domain/workspace/types';
import { batchArray } from './chunkingOps';
import { createLogger } from '../../../infrastructure/runtime/logger';

const log = createLogger("artifact-synthesis");

type ChangeControl = ReturnType<typeof defaultIterationChangeControl>;

// ── 数据序列化：将 ChangeControl 结构化数据转为 LLM 可理解的文本 ──

function serializeBusinessContext(biz: ChangeControl["lastBusinessConfirmation"], sections: string[]) {
  if (biz?.coreIntent) sections.push(`核心意图: ${biz.coreIntent}`);
  if (biz?.boundarySummary) sections.push(`边界摘要: ${biz.boundarySummary}`);
  if (biz?.functionalPoints?.length) sections.push(`功能要点:\n${biz.functionalPoints.slice(0, 12).map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
  if (biz?.successCriteria?.length) sections.push(`成功标准:\n${biz.successCriteria.slice(0, 8).map((c) => `- ${c}`).join("\n")}`);
  const na = biz?.necessityAssessment;
  if (na) {
    const naLines: string[] = [];
    if (na.mustDo?.length) naLines.push(`必须完成: ${na.mustDo.join("；")}`);
    if (na.shouldDo?.length) naLines.push(`建议纳入: ${na.shouldDo.join("；")}`);
    if (na.canDefer?.length) naLines.push(`可延期: ${na.canDefer.join("；")}`);
    if (na.outOfScope?.length) naLines.push(`超出范围: ${na.outOfScope.join("；")}`);
    if (na.rationale) naLines.push(`判断依据: ${na.rationale}`);
    if (naLines.length > 0) sections.push(`必要性评估:\n${naLines.join("\n")}`);
  }
  const ii = biz?.interactionInsights;
  if (ii) {
    const iiLines: string[] = [];
    if (ii.primaryFlow?.length) iiLines.push(`主流程: ${ii.primaryFlow.join("；")}`);
    if (ii.keyInteractions?.length) iiLines.push(`关键交互: ${ii.keyInteractions.join("；")}`);
    if (ii.exceptionPaths?.length) iiLines.push(`异常路径: ${ii.exceptionPaths.join("；")}`);
    if (ii.usabilityRisks?.length) iiLines.push(`可用性风险: ${ii.usabilityRisks.join("；")}`);
    if (iiLines.length > 0) sections.push(`交互洞察:\n${iiLines.join("\n")}`);
  }
  if (biz?.versionDiffSummary) sections.push(`版本差异摘要: ${biz.versionDiffSummary}`);
  if (biz?.diffNarratives?.length) sections.push(`变更叙述: ${biz.diffNarratives.join("；")}`);
  if (biz?.confirmationChecklist?.length) {
    const items = biz.confirmationChecklist.map((c) =>
      typeof c === "string" ? c : typeof c === "object" && c !== null ? String((c as Record<string, unknown>).item || c) : String(c)
    );
    sections.push(`确认检查: ${items.join("；")}`);
  }
  const evidenceRefs = (biz as Record<string, unknown>)?.evidenceRefs;
  if (Array.isArray(evidenceRefs) && evidenceRefs.length > 0) {
    sections.push(`证据引用: ${evidenceRefs.filter((r): r is string => typeof r === "string").join("；")}`);
  }
}

function serializeInsightsAndFindings(cc: ChangeControl, sections: string[]) {
  const prioritized = cc.lastPrioritizedFindings;
  if (Array.isArray(prioritized) && prioritized.length > 0) {
    sections.push(`优先级发现:\n${prioritized.map((f) => `[${f.priority}] ${f.content}${f.reason ? ` — ${f.reason}` : ""}`).join("\n")}`);
  }
  if (Array.isArray(cc.lastMeaningfulFindings) && cc.lastMeaningfulFindings.length > 0) {
    sections.push(`关键发现:\n${cc.lastMeaningfulFindings.map((f) => `- ${f}`).join("\n")}`);
  }
  const deep = cc.lastDeepInsightsSummary;
  if (deep) {
    const deepLines: string[] = [];
    if (deep.themes?.length) deepLines.push(`主题: ${deep.themes.join("；")}`);
    if (deep.gaps?.length) deepLines.push(`差距: ${deep.gaps.join("；")}`);
    if (deep.rootCauses?.length) deepLines.push(`根因: ${deep.rootCauses.join("；")}`);
    if (deep.decisionSuggestions?.length) deepLines.push(`决策建议: ${deep.decisionSuggestions.join("；")}`);
    if (deepLines.length > 0) sections.push(`深度洞察:\n${deepLines.join("\n")}`);
  }
}

function serializeDomainAndBoundary(cc: ChangeControl, sections: string[]) {
  const domainEntries = cc.domainKnowledgeEntries;
  if (Array.isArray(domainEntries) && domainEntries.length > 0) {
    const entryLines = domainEntries.slice(0, 15).map((e) => {
      const parts = [`${e.term}: ${e.definition || "无定义"}`];
      if (e.mappedApis?.length) parts.push(`接口：${e.mappedApis.join("、")}`);
      if (e.mappedEntities?.length) parts.push(`实体：${e.mappedEntities.join("、")}`);
      if (e.mappedPages?.length) parts.push(`页面：${e.mappedPages.join("、")}`);
      if (e.mappedCodePaths?.length) parts.push(`代码：${e.mappedCodePaths.join("、")}`);
      return parts.join(" | ");
    });
    sections.push(`领域知识:\n${entryLines.join("\n")}`);
  }
  const boundary = cc.boundary;
  if (boundary) {
    const bLines: string[] = [];
    if (boundary.requirementRefs?.length) bLines.push(`需求映射: ${boundary.requirementRefs.slice(0, 12).join("；")}`);
    if (boundary.componentRefs?.length) bLines.push(`受影响组件: ${boundary.componentRefs.slice(0, 12).join("；")}`);
    if (boundary.codePaths?.length) bLines.push(`代码路径: ${boundary.codePaths.slice(0, 12).join("；")}`);
    if (boundary.note) bLines.push(`备注: ${boundary.note}`);
    if (bLines.length > 0) sections.push(`变更边界:\n${bLines.join("\n")}`);
  }
  const ec = cc.executableConstraints;
  if (ec) {
    const ecLines: string[] = [];
    if (ec.componentWhitelist?.length) ecLines.push(`组件白名单: ${ec.componentWhitelist.join("；")}`);
    if (ec.codePathWhitelist?.length) ecLines.push(`代码路径白名单: ${ec.codePathWhitelist.join("；")}`);
    if (ec.acceptanceChecks?.length) ecLines.push(`验收检查项: ${ec.acceptanceChecks.join("；")}`);
    if (ecLines.length > 0) sections.push(`可执行约束:\n${ecLines.join("\n")}`);
  }
  const ts = cc.traceabilitySnapshot;
  if (ts && ts.requirementCoverage > 0) {
    sections.push(`追溯覆盖：需求覆盖率 ${ts.requirementCoverage}%，映射置信度 ${ts.mappingConfidence}${ts.unmappedRequirements?.length ? `，未映射需求：${ts.unmappedRequirements.join("；")}` : ""}${ts.conflicts?.length ? `，映射冲突：${ts.conflicts.join("；")}` : ""}`);
  }
}

function serializeQualityAndTestSignals(cc: ChangeControl, sections: string[]) {
  const ux = cc.uxArtifacts;
  if (ux) {
    const uxLines: string[] = [];
    if (ux.informationArchitecture?.length) uxLines.push(`信息架构: ${ux.informationArchitecture.join("；")}`);
    if (ux.interactionFlows?.length) uxLines.push(`交互流程: ${ux.interactionFlows.join("；")}`);
    if (ux.uiStates?.length) uxLines.push(`界面状态: ${ux.uiStates.join("；")}`);
    if (ux.uxConstraints?.length) uxLines.push(`设计约束: ${ux.uxConstraints.join("；")}`);
    if (uxLines.length > 0) sections.push(`UX 数据:\n${uxLines.join("\n")}`);
  }
  const qualityLines: string[] = [];
  if (cc.lastReportQualityScore) qualityLines.push(`报告质量评分: ${cc.lastReportQualityScore}`);
  if (cc.lastReportQualitySummary) qualityLines.push(`质量摘要: ${cc.lastReportQualitySummary}`);
  if (cc.lastReleaseReviewDecision) {
    qualityLines.push(`发布评审: ${cc.lastReleaseReviewDecision}${cc.lastReleaseReviewReason ? ` — ${cc.lastReleaseReviewReason}` : ""}`);
  }
  if (cc.lastReleaseReviewBlockers?.length) qualityLines.push(`阻断项: ${cc.lastReleaseReviewBlockers.join("；")}`);
  if (qualityLines.length > 0) sections.push(`质量信号:\n${qualityLines.join("\n")}`);
  const matrix = cc.generatedTestMatrix || [];
  if (matrix.length > 0) {
    const passed = matrix.filter((tc) => tc.executionStatus === "passed").length;
    const failed = matrix.filter((tc) => tc.executionStatus === "failed").length;
    sections.push(`测试矩阵: 共${matrix.length}用例, 通过${passed}, 失败${failed}, 待执行${matrix.length - passed - failed}`);
  }
  if (cc.clarificationQuestions?.length) {
    sections.push(`待澄清问题: ${cc.clarificationQuestions.join("；")}`);
  }
}

function serializeAvailableData(iteration: Iteration, cc: ChangeControl): string {
  const scope = iteration.scope;
  const assessment = iteration.assessment;
  const continuity = iteration.continuity;
  const sections: string[] = [];

  sections.push([
    `迭代名称: ${iteration.name}`,
    `迭代描述: ${iteration.description}`,
    `迭代状态: ${iteration.status}`,
    `版本: ${iteration.version || "未指定"}`,
    iteration.goals?.length ? `迭代目标: ${iteration.goals.join("；")}` : "",
  ].filter(Boolean).join("\n"));

  serializeBusinessContext(cc.lastBusinessConfirmation, sections);
  serializeInsightsAndFindings(cc, sections);
  serializeDomainAndBoundary(cc, sections);

  if (scope.inScope?.length) sections.push(`纳入范围: ${scope.inScope.join("；")}`);
  if (scope.outOfScope?.length) sections.push(`排除范围: ${scope.outOfScope.join("；")}`);
  if (scope.acceptanceCriteria?.length) sections.push(`验收标准: ${scope.acceptanceCriteria.join("；")}`);
  if (Array.isArray(assessment?.risks) && assessment.risks.length > 0) {
    sections.push(`已识别风险: ${assessment.risks.join("；")}`);
  }
  if (continuity?.inheritedFromIterationId) {
    sections.push(`继承自迭代: ${continuity.inheritedFromIterationId}${continuity.inheritedSummary ? ` — ${continuity.inheritedSummary}` : ""}`);
  }

  serializeQualityAndTestSignals(cc, sections);
  const result = sections.join("\n\n");
  return result.length > 8000 ? result.slice(0, 8000) + "\n…（上下文已截断）" : result;
}

// ── Artifact Prompt 定义 ──

type ArtifactPromptConfig = {
  role: string;
  documentType: string;
  bestPractice: string;
};

const ARTIFACT_PROMPTS: Record<string, ArtifactPromptConfig> = {
  "analysis-report": {
    role: "资深需求分析师",
    documentType: "需求分析报告",
    bestPractice: [
      "文档结构应包含：",
      "1. 核心意图与业务目标",
      "2. 边界摘要（系统范围、功能范围）",
      "3. 功能要点（按业务价值排序）",
      "4. 必要性评估（必须做/建议纳入/可延期/超出范围，附判断依据）",
      "5. 成功标准（可衡量的验收指标）",
      "6. 交互洞察（主流程/关键交互/异常路径/可用性风险）",
      "7. 关键发现与优先级问题（P0阻断项/P1高优/P2建议，每条附原因）",
      "8. 深度洞察（跨模块主题/差距/根因/决策建议）",
      "9. 行动建议（阻断项、待澄清、需补充项的汇总）",
      "10. 风险清单",
      "11. 版本差异（对比上版本的变更叙述）",
      "12. 附录：分析元数据（质量评分/追溯覆盖率）"
    ].join("\n")
  },
  "product-requirements-doc": {
    role: "资深产品经理",
    documentType: "产品需求文档（PRD）",
    bestPractice: [
      "文档结构应包含：",
      "1. 文档修订记录（迭代版本/继承关系/分析时间）",
      "2. 产品概述",
      "  2.1 背景与目标（核心业务意图/迭代目标/必要性依据）",
      "  2.2 产品愿景（边界摘要/战略方向建议）",
      "  2.3 用户画像与场景（核心使用场景/关键用户行为）",
      "3. 范围定义",
      "  3.1 核心功能清单（按 P0/P1/P2 优先级排列的表格，含功能描述和理由）",
      "  3.2 非功能性需求（性能/安全/可用性约束）",
      "  3.3 明确排除项（超出范围/可延期项）",
      "4. 详细功能需求（对每个高优先级功能展开：业务规则/验收标准/交互要求）",
      "5. 数据需求",
      "  5.1 关键数据指标（成功标准→KPI）",
      "  5.2 追溯覆盖（需求覆盖率/未映射需求/冲突）",
      "6. UI/UX 需求",
      "  6.1 交互设计要点（信息架构/交互流程/界面状态/设计约束）",
      "  6.2 异常路径与可用性风险",
      "7. 上线与运营计划",
      "  7.1 发布评审状态",
      "  7.2 风险项",
      "  7.3 待确认事项",
      "8. 附录（术语表/版本差异/参考文档）"
    ].join("\n")
  },
  "boundary-confirmation": {
    role: "系统架构师",
    documentType: "变更边界确认书",
    bestPractice: [
      "文档结构应包含：",
      "1. 业务边界说明（本次变更的业务范围描述）",
      "2. 需求映射（涉及的需求项清单）",
      "3. 受影响组件（模块/服务清单）",
      "4. 代码路径（受影响的代码目录/文件）",
      "5. 验收检查项（自动生成的可执行验收条件）",
      "6. 必要性依据与明确排除项",
      "7. 边界完整度评估（各维度的填充情况和建议补充方向）"
    ].join("\n")
  },
  "design-spec": {
    role: "资深交互设计师",
    documentType: "设计规范文档",
    bestPractice: [
      "文档结构应包含：",
      "1. 设计概述（设计目标/需覆盖的核心功能）",
      "2. 信息架构（页面层级/导航结构）",
      "3. 交互规范",
      "  3.1 核心流程（主流程描述/关键步骤）",
      "  3.2 关键交互（用户与系统的关键交互点）",
      "  3.3 界面状态（各页面/组件的状态定义）",
      "4. 异常处理与边界情况（异常路径/错误提示/边界情况处理）",
      "5. 设计约束（技术约束/平台约束/品牌规范）",
      "6. 需覆盖功能对照（功能清单 vs 设计覆盖情况）"
    ].join("\n")
  },
  "technical-architecture": {
    role: "资深系统架构师",
    documentType: "技术架构文档",
    bestPractice: [
      "文档结构参考 arc42/C4 模型：",
      "1. 架构概述（系统目标/系统边界/架构决策方向）",
      "2. 系统上下文",
      "  2.1 受影响模块（组件清单及职责说明）",
      "  2.2 代码路径（受影响的代码目录结构）",
      "  2.3 模块依赖映射（领域概念→代码模块映射）",
      "3. 技术决策（决策建议/技术约束/选型考量）",
      "4. 接口协议概要（关键接口清单及协作关系）",
      "5. 风险与技术债务",
      "  5.1 已识别技术风险（P0/P1 级别风险）",
      "  5.2 技术差距分析",
      "  5.3 追溯覆盖评估",
      "6. 验收检查（技术层面的验收条件）"
    ].join("\n")
  },
  "api-specification": {
    role: "后端架构师",
    documentType: "接口设计文档",
    bestPractice: [
      "文档结构参考 OpenAPI 规范：",
      "1. 概述（接口服务的业务目标/涉及组件范围）",
      "2. 接口清单（表格：接口名/所属领域/关联页面）",
      "3. 接口详情（对每个接口展开：所属领域/描述/关联页面/关联数据实体/证据来源）",
      "4. 数据模型（实体定义/字段说明/关联关系）",
      "5. 非功能性约束（性能/安全/限流等要求）",
      "6. 术语表（领域术语/定义/关联实体映射）"
    ].join("\n")
  },
  "database-design": {
    role: "数据架构师",
    documentType: "数据模型设计文档",
    bestPractice: [
      "文档结构应包含：",
      "1. 概述（数据模型服务的业务目标）",
      "2. 数据实体定义（对每个实体：定义/字段/关联代码路径/关联接口）",
      "3. 实体关系映射（实体间的关联关系/数据流向）",
      "4. 索引与查询策略建议",
      "5. 数据迁移注意事项"
    ].join("\n")
  },
  "test-matrix": {
    role: "质量工程师",
    documentType: "测试矩阵文档",
    bestPractice: [
      "文档结构应包含：",
      "1. 执行概览（用例总数/通过率/失败率）",
      "2. 测试用例分类（按类型分组：单元测试/集成测试/端到端/验收）",
      "3. 每个用例的详情（ID/测试焦点/执行状态/备注）",
      "4. 风险用例分析（失败用例的影响评估）",
      "5. 覆盖度评估（需求覆盖/功能覆盖/路径覆盖）"
    ].join("\n")
  },
  "acceptance-checklist": {
    role: "质量保证负责人",
    documentType: "验收清单",
    bestPractice: [
      "文档结构应包含：",
      "1. 验收概览（检查项总数/来源分布）",
      "2. 验收检查项明细（来源标注：需求范围/质量评审/自动生成）",
      "3. 关键验收路径（哪些检查项是阻断性的）",
      "4. 验收前置条件（需要先完成的准备工作）"
    ].join("\n")
  },
  "release-review": {
    role: "发布管理负责人",
    documentType: "发布评审报告",
    bestPractice: [
      "文档结构应包含：",
      "1. 评审结论（决策：允许/谨慎/阻塞，附评分和理由）",
      "2. 阻塞项清单（影响发布的阻断因素）",
      "3. 建议行动（基于评审结论的具体操作建议）",
      "4. 发布门禁检查（测试通过率/分析确认状态/边界确认状态）",
      "5. 回滚建议（是否建议准备回滚/触发条件）"
    ].join("\n")
  },
  "deployment-plan": {
    role: "运维架构师",
    documentType: "部署方案",
    bestPractice: [
      "文档结构参考 Release Management 最佳实践：",
      "1. 部署概述（部署背景/发布评审结论）",
      "2. 部署范围",
      "  2.1 受影响组件",
      "  2.2 代码变更路径",
      "  2.3 关联功能",
      "3. 部署前检查清单（可勾选的检查项）",
      "4. 发布门禁（测试通过率/分析确认/边界确认）",
      "5. 回滚策略（触发条件/回滚步骤）",
      "6. 部署后验证（验证步骤/预期指标）"
    ].join("\n")
  },
  "delivery-package": {
    role: "项目交付负责人",
    documentType: "交付归档文档",
    bestPractice: [
      "文档结构应包含：",
      "1. 迭代成果摘要（迭代名称/状态/核心意图/交付物完成度/质量评分）",
      "2. 归档文件清单",
      "3. 关键交付成果（分析确认/测试结果/发布评审）",
      "4. 下一迭代继承项（继承的目标和风险）"
    ].join("\n")
  }
};

// 不需要 LLM 合成的 artifact（引用型/用户上传型）
const SKIP_LLM_SYNTHESIS = new Set(["frontend-code", "backend-code", "prototype-preview"]);

// ── 单个 artifact 合成 ──

async function synthesizeSingleArtifact(
  agentRunner: AgentRunner,
  artifactId: string,
  iteration: Iteration,
  _cc: ChangeControl,
  availableData: string
): Promise<{ content: string; clarifications: string[] }> {
  const config = ARTIFACT_PROMPTS[artifactId];
  if (!config) return { content: "", clarifications: [] };

  const prompt: IterationAgentPrompt = {
    agentId: `agent-artifact-${artifactId}`,
    role: "orchestrator",
    scope: "iteration",
    goal: `生成高质量的${config.documentType}`,
    expectedOutput: "markdown 文档 + 末尾 JSON clarifications",
    systemPrompt: [
      `你是${config.role}。请基于以下结构化分析数据，按照行业最佳实践输出一份高质量的${config.documentType}。`,
      "",
      "输出规则：",
      "- 格式：markdown，使用中文",
      "- 所有内容必须基于提供的分析数据，不要虚构或编造",
      "- 数据充分的章节：输出高质量、有实际参考价值的专业内容",
      "- 数据不足的章节：不要输出任何占位符、「待补充」或空章节，直接省略该章节",
      "- 你的输出将直接作为交付物呈现给用户，必须具有实际指导价值",
      "- 禁止出现内部字段名、JSON 路径、技术变量名等系统内部信息",
      "",
      `${config.bestPractice}`,
      "",
      "输出格式要求：",
      "1. 先输出完整的 markdown 文档",
      "2. 文档末尾另起一行，输出一个 JSON 对象（不要用 ```json 包裹）：",
      '{"clarifications": ["需要用户补充的具体信息1", "需要用户补充的具体信息2"]}',
      "如果所有信息都充足，输出空数组：{\"clarifications\": []}",
      "clarifications 中的每一条必须是具体的、可操作的问题，不是笼统的「请补充更多信息」"
    ].join("\n"),
    userPrompt: [
      `=== 迭代信息 ===`,
      `名称: ${iteration.name}`,
      `描述: ${iteration.description}`,
      "",
      `=== 分析数据 ===`,
      availableData,
      "",
      `请输出${config.documentType}。`
    ].join("\n")
  };

  const result = await runAnalysisPrompt(agentRunner, prompt);
  return parseArtifactResponse(result.content);
}

function parseArtifactResponse(content: string): { content: string; clarifications: string[] } {
  // 从末尾提取 JSON clarifications
  const jsonPattern = /\{"clarifications"\s*:\s*\[.*?\]\s*\}\s*$/s;
  const match = content.match(jsonPattern);

  let clarifications: string[] = [];
  let docContent = content;

  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { clarifications?: unknown };
      if (Array.isArray(parsed.clarifications)) {
        clarifications = parsed.clarifications.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
      }
      docContent = content.slice(0, match.index).trim();
    } catch (err) {
      log.debug("artifact response JSON parse failed, treating entire output as document", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return { content: docContent, clarifications };
}

// ── 按需合成单个交付物（供 Coach 对话链路调用） ──

export async function synthesizeSingleArtifactOnDemand(
  agentRunner: AgentRunner,
  artifactId: string,
  iteration: Iteration,
  cc: ChangeControl
): Promise<{ content: string; clarifications: string[] }> {
  if (SKIP_LLM_SYNTHESIS.has(artifactId) || !ARTIFACT_PROMPTS[artifactId]) {
    return { content: "", clarifications: [] };
  }
  const availableData = serializeAvailableData(iteration, cc);
  return synthesizeSingleArtifact(agentRunner, artifactId, iteration, cc, availableData);
}

// ── 主入口 ──

export async function synthesizeArtifactDraftsViaLlm(
  agentRunner: AgentRunner | null,
  iteration: Iteration,
  cc: ChangeControl
): Promise<{
  updatedDrafts: Array<{ artifactId: string; content: string }>;
  clarifications: string[];
}> {
  if (!agentRunner) {
    throw new LlmUnavailableError("LLM is not configured. Artifact synthesis requires LLM.");
  }

  const availableData = serializeAvailableData(iteration, cc);

  // 确定需要合成的 artifact
  const workflowItems = cc.artifactWorkflow?.items ?? [];
  const targetArtifacts = workflowItems
    .filter((item) => !SKIP_LLM_SYNTHESIS.has(item.id) && ARTIFACT_PROMPTS[item.id])
    .map((item) => item.id);

  if (targetArtifacts.length === 0) {
    return { updatedDrafts: [], clarifications: [] };
  }

  // 分批并发（每批 3 个）
  const batches = batchArray(targetArtifacts, 3) as string[][];
  const allDrafts: Array<{ artifactId: string; content: string }> = [];
  const allClarifications: string[] = [];

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((artifactId) =>
        synthesizeSingleArtifact(agentRunner, artifactId, iteration, cc, availableData)
          .then((r) => ({ artifactId, ...r }))
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.content) {
        allDrafts.push({ artifactId: result.value.artifactId, content: result.value.content });
        allClarifications.push(...result.value.clarifications);
      } else if (result.status === "rejected") {
        log.warn("artifact synthesis failed", {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
        // 单个 artifact 失败不阻断其他，但会被记录
      }
    }
  }

  return {
    updatedDrafts: allDrafts,
    clarifications: Array.from(new Set(allClarifications))
  };
}
