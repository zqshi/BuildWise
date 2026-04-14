import type { Iteration } from '../../../domain/workspace/types';
import { defaultIterationChangeControl } from '../shared/common';
import { sanitizeDisplayMarkdown } from '../coach/messageSanitizer';

type ChangeControl = ReturnType<typeof defaultIterationChangeControl>;

function joinLines(...lines: string[]) {
  return lines.filter(Boolean).join("\n");
}

function sectionBlock(title: string, items: string[]) {
  const filtered = items.filter(Boolean);
  if (filtered.length === 0) return "";
  return `## ${title}\n${filtered.map((item) => `- ${item}`).join("\n")}`;
}

function synthesizeAnalysisReport(iteration: Iteration, cc: ChangeControl): string {
  const assessment = iteration.assessment;
  const continuity = iteration.continuity;
  const biz = cc.lastBusinessConfirmation;
  const sections: string[] = [];

  // 继承上下文
  if (continuity?.inheritedFromIterationId) {
    sections.push(joinLines(
      `## 继承上下文`,
      continuity.inheritedSummary || `继承自迭代 ${continuity.inheritedFromIterationId}`,
      continuity.carriedGoals?.length ? `继承目标：${continuity.carriedGoals.join("、")}` : "",
      continuity.carriedRisks?.length ? `继承风险：${continuity.carriedRisks.join("、")}` : ""
    ));
  }

  // 核心意图（来自 LLM 分析）
  if (biz?.coreIntent) {
    sections.push(joinLines("## 核心意图", biz.coreIntent));
  }

  // 边界摘要
  if (biz?.boundarySummary) {
    sections.push(joinLines("## 边界摘要", biz.boundarySummary));
  }

  // 必要性评估
  const na = biz?.necessityAssessment;
  if (na) {
    const naLines: string[] = [];
    if (na.mustDo?.length) naLines.push(`必须完成：${na.mustDo.join("、")}`);
    if (na.shouldDo?.length) naLines.push(`建议纳入：${na.shouldDo.join("、")}`);
    if (na.canDefer?.length) naLines.push(`可延期：${na.canDefer.join("、")}`);
    if (na.outOfScope?.length) naLines.push(`超出范围：${na.outOfScope.join("、")}`);
    if (na.rationale) naLines.push(`判断依据：${na.rationale}`);
    if (naLines.length > 0) sections.push(joinLines("## 必要性评估", ...naLines));
  }

  // 功能要点
  if (biz?.functionalPoints?.length) {
    sections.push(sectionBlock("功能要点", biz.functionalPoints));
  }

  // 成功标准
  if (biz?.successCriteria?.length) {
    sections.push(sectionBlock("成功标准", biz.successCriteria));
  }

  // 关键发现详情
  const findings = cc.lastMeaningfulFindings;
  if (Array.isArray(findings) && findings.length > 0) {
    sections.push(sectionBlock("关键发现", findings));
  }

  // 优先级问题
  const prioritized = cc.lastPrioritizedFindings;
  if (Array.isArray(prioritized) && prioritized.length > 0) {
    const grouped: Record<string, Array<{ content: string; reason: string }>> = {};
    for (const item of prioritized) {
      const key = item.priority || "P2";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }
    const priorityLabels: Record<string, string> = { P0: "P0 — 阻断项", P1: "P1 — 高优先级", P2: "P2 — 建议改进" };
    const lines: string[] = ["## 优先级问题"];
    for (const key of ["P0", "P1", "P2"]) {
      const items = grouped[key];
      if (!items?.length) continue;
      lines.push(`\n### ${priorityLabels[key] ?? key}`);
      for (const item of items) {
        lines.push(`- ${item.content}${item.reason ? `\n  原因：${item.reason}` : ""}`);
      }
    }
    if (lines.length > 1) sections.push(lines.join("\n"));
  }

  // 深度洞察
  const deep = cc.lastDeepInsightsSummary;
  if (deep) {
    const deepLines: string[] = [];
    if (deep.themes?.length) deepLines.push(`主题：${deep.themes.join("、")}`);
    if (deep.gaps?.length) deepLines.push(`差距：${deep.gaps.join("、")}`);
    if (deep.rootCauses?.length) deepLines.push(`根因：${deep.rootCauses.join("、")}`);
    if (deep.decisionSuggestions?.length) deepLines.push(`决策建议：${deep.decisionSuggestions.join("、")}`);
    if (deepLines.length > 0) sections.push(joinLines("## 深度洞察", ...deepLines));
  }

  // 澄清问题
  const questions = cc.clarificationQuestions;
  if (Array.isArray(questions) && questions.length > 0) {
    sections.push(`## 待澄清问题\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`);
  }

  // 待确认事项
  if (biz?.confirmationChecklist?.length) {
    sections.push(sectionBlock("待确认事项", biz.confirmationChecklist));
  }

  // 交互洞察
  const reportIi = biz?.interactionInsights;
  if (reportIi) {
    const iiLines: string[] = [];
    if (reportIi.primaryFlow?.length) iiLines.push(`主流程：${reportIi.primaryFlow.join("、")}`);
    if (reportIi.keyInteractions?.length) iiLines.push(`关键交互：${reportIi.keyInteractions.join("、")}`);
    if (reportIi.exceptionPaths?.length) iiLines.push(`异常路径：${reportIi.exceptionPaths.join("、")}`);
    if (reportIi.usabilityRisks?.length) iiLines.push(`可用性风险：${reportIi.usabilityRisks.join("、")}`);
    if (iiLines.length > 0) sections.push(joinLines("## 交互洞察", ...iiLines));
  }

  // 版本差异摘要
  if (biz?.versionDiffSummary) {
    sections.push(joinLines("## 版本差异", biz.versionDiffSummary));
  } else if (assessment?.deltaInScope?.length || assessment?.resolvedItems?.length) {
    const items: string[] = [];
    if (assessment.deltaInScope.length > 0) items.push(`新增范围：${assessment.deltaInScope.join("、")}`);
    if (assessment.resolvedItems.length > 0) items.push(`已解决：${assessment.resolvedItems.join("、")}`);
    if (assessment.pendingItems.length > 0) items.push(`待处理：${assessment.pendingItems.join("、")}`);
    if (items.length > 0) sections.push(sectionBlock("版本差异", items));
  }

  // 变更叙述
  if (biz?.diffNarratives?.length) {
    sections.push(sectionBlock("变更叙述", biz.diffNarratives));
  }

  // 分析质量
  if (cc.lastReportQualitySummary) {
    sections.push(joinLines(
      `## 分析质量`,
      `评分：${cc.lastReportQualityScore ?? "-"}`,
      cc.lastReportQualitySummary,
      cc.lastReportPublishable === false ? "状态：报告尚未达到可发布标准" : ""
    ));
  }

  // 追溯覆盖
  if (cc.traceabilitySnapshot?.requirementCoverage !== undefined) {
    const ts = cc.traceabilitySnapshot;
    sections.push(joinLines(
      `## 追溯覆盖`,
      `需求覆盖率：${ts.requirementCoverage}%`,
      `映射置信度：${ts.mappingConfidence || "-"}`,
      ts.unmappedRequirements?.length ? `未映射需求：${ts.unmappedRequirements.join("、")}` : ""
    ));
  }

  // 风险与建议
  const risks = assessment?.risks;
  if (Array.isArray(risks) && risks.length > 0) {
    sections.push(sectionBlock("已识别风险", risks));
  }

  if (sections.length === 0) return "";
  const header = continuity?.inheritedFromIterationId ? "# 继承差异分析报告" : "# 首版需求分析报告";
  return `${header}\n\n${sections.join("\n\n")}`;
}

function synthesizeBoundary(cc: ChangeControl): string {
  const b = cc.boundary;
  if (!b) return "";
  const sections: string[] = [];
  sections.push("# 变更边界确认");
  if (b.requirementRefs.length > 0) sections.push(sectionBlock("需求映射", b.requirementRefs));
  if (b.componentRefs.length > 0) sections.push(sectionBlock("受影响组件", b.componentRefs));
  if (b.codePaths.length > 0) sections.push(sectionBlock("代码路径", b.codePaths));
  if (b.note) sections.push(`## 备注\n${b.note}`);
  const ec = cc.executableConstraints;
  if (ec) {
    if (ec.acceptanceChecks?.length > 0) sections.push(sectionBlock("验收检查项", ec.acceptanceChecks));
  }
  const boundaryNa = cc.lastBusinessConfirmation?.necessityAssessment;
  if (boundaryNa?.rationale) {
    sections.push(joinLines("## 必要性依据", boundaryNa.rationale));
  }
  if (boundaryNa?.outOfScope?.length) {
    sections.push(sectionBlock("明确排除项", boundaryNa.outOfScope));
  }
  return sections.length > 1 ? sections.join("\n\n") : "";
}

function synthesizeTestMatrix(cc: ChangeControl): string {
  const matrix = Array.isArray(cc.generatedTestMatrix) ? cc.generatedTestMatrix : [];
  if (matrix.length === 0) return "";
  const sections: string[] = ["# 测试矩阵"];

  // 统计摘要
  const passed = matrix.filter((tc) => tc.executionStatus === "passed").length;
  const failed = matrix.filter((tc) => tc.executionStatus === "failed").length;
  const pending = matrix.length - passed - failed;
  sections.push(joinLines(
    "## 执行概览",
    `用例总数：${matrix.length}`,
    `通过：${passed}　失败：${failed}　待执行：${pending}`,
    matrix.length > 0 ? `通过率：${Math.round((passed / matrix.length) * 100)}%` : ""
  ));

  // 按类型分组
  const grouped: Record<string, typeof matrix> = {};
  for (const tc of matrix) {
    const key = tc.type || "other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tc);
  }
  const typeLabels: Record<string, string> = { unit: "单元测试", integration: "集成测试", e2e: "端到端测试", acceptance: "验收测试" };
  for (const [type, cases] of Object.entries(grouped)) {
    const label = typeLabels[type] ?? type;
    const caseLines = cases.slice(0, 15).map((tc) => {
      const statusLabel = tc.executionStatus === "passed" ? "通过" : tc.executionStatus === "failed" ? "失败" : tc.executionStatus || "待执行";
      return `**${tc.caseId || "?"}** ${tc.focus || ""} — ${statusLabel}${tc.executionNote ? `（${tc.executionNote}）` : ""}`;
    });
    sections.push(sectionBlock(label, caseLines));
    if (cases.length > 15) sections[sections.length - 1] += `\n- ...及其他 ${cases.length - 15} 条`;
  }

  return sections.join("\n\n");
}

function synthesizeReleaseReview(cc: ChangeControl): string {
  if (!cc.lastReleaseReviewDecision) return "";
  const sections: string[] = ["# 发布评审"];

  // 决策与评分
  const decisionLabel = cc.lastReleaseReviewDecision === "go" ? "允许发布" : cc.lastReleaseReviewDecision === "caution" ? "谨慎发布" : "阻塞发布";
  sections.push(joinLines(
    "## 评审结论",
    `决策：${decisionLabel}`,
    cc.lastReleaseReviewScore !== undefined ? `评分：${cc.lastReleaseReviewScore}` : ""
  ));

  // 评审理由
  if (cc.lastReleaseReviewReason) {
    sections.push(joinLines("## 评审理由", cc.lastReleaseReviewReason));
  }

  // 阻塞项
  if (Array.isArray(cc.lastReleaseReviewBlockers) && cc.lastReleaseReviewBlockers.length > 0) {
    sections.push(sectionBlock("阻塞项", cc.lastReleaseReviewBlockers));
  }

  // 回滚建议
  if (cc.lastOpsRollbackSuggested) {
    sections.push(joinLines("## 回滚建议", "建议回滚：是"));
  }

  return sections.join("\n\n");
}

function synthesizeAcceptanceChecklist(cc: ChangeControl): string {
  const checklist = cc.qualityArtifacts?.acceptanceChecklist;
  if (!Array.isArray(checklist) || checklist.length === 0) return "";
  const sections: string[] = ["# 验收清单"];

  // 验收项
  sections.push(`## 验收检查项\n${checklist.map((item) => `- [ ] ${item}`).join("\n")}`);

  // 补充：可执行约束中的验收检查
  const ecChecks = cc.executableConstraints?.acceptanceChecks;
  if (Array.isArray(ecChecks) && ecChecks.length > 0) {
    const extra = ecChecks.filter((item) => !checklist.includes(item));
    if (extra.length > 0) {
      sections.push(sectionBlock("自动生成检查项", extra));
    }
  }

  return sections.join("\n\n");
}

function synthesizeDeliveryPackage(iteration: Iteration, cc: ChangeControl): string {
  const files = cc.qualityArtifacts?.materializedFiles;
  if (!Array.isArray(files) || files.length === 0) return "";
  const sections: string[] = ["# 交付归档"];

  // 基本信息
  sections.push(joinLines(
    "## 迭代信息",
    `迭代名称：${iteration.name}`,
    `状态：${iteration.status}`
  ));

  // 归档文件清单
  sections.push(sectionBlock("归档文件", files));

  // 继承上下文
  const continuity = iteration.continuity;
  if (continuity?.carriedGoals?.length || continuity?.carriedRisks?.length) {
    const carryLines: string[] = [];
    if (continuity.carriedGoals?.length) carryLines.push(...continuity.carriedGoals.map((g) => `[目标] ${g}`));
    if (continuity.carriedRisks?.length) carryLines.push(...continuity.carriedRisks.map((r) => `[风险] ${r}`));
    sections.push(sectionBlock("下一迭代继承项", carryLines));
  }

  return sections.join("\n\n");
}

function synthesizeProductRequirementsDoc(iteration: Iteration, cc: ChangeControl): string {
  const scope = iteration.scope;
  const biz = cc.lastBusinessConfirmation;
  const na = biz?.necessityAssessment;
  const ii = biz?.interactionInsights;
  const sections: string[] = ["# 产品需求文档"];

  // 核心意图
  if (biz?.coreIntent) {
    sections.push(joinLines("## 核心意图", biz.coreIntent));
  }

  // 迭代目标：优先 LLM mustDo，降级到 iteration.goals
  const goalItems = na?.mustDo?.length ? na.mustDo : (Array.isArray(iteration.goals) ? iteration.goals : []);
  if (goalItems.length > 0) {
    const goalSection = sectionBlock("迭代目标", goalItems);
    if (goalSection) {
      const rationale = na?.rationale ? `\n\n> ${na.rationale}` : "";
      sections.push(goalSection + rationale);
    }
  }

  // 边界摘要
  if (biz?.boundarySummary) {
    sections.push(joinLines("## 边界摘要", biz.boundarySummary));
  }

  // 纳入范围：合并 mustDo + shouldDo，降级到 scope.inScope
  const inScopeFromLlm = [...(na?.mustDo || []), ...(na?.shouldDo || [])].filter(Boolean);
  const resolvedInScope = inScopeFromLlm.length > 0 ? inScopeFromLlm : scope.inScope;
  if (resolvedInScope.length > 0) {
    sections.push(sectionBlock("纳入范围", resolvedInScope));
  }

  // 排除范围：合并 outOfScope + canDefer（加前缀），降级到 scope.outOfScope
  const outScopeFromLlm = [
    ...(na?.outOfScope || []),
    ...(na?.canDefer || []).map((item) => `[可延期] ${item}`)
  ].filter(Boolean);
  const resolvedOutScope = outScopeFromLlm.length > 0 ? outScopeFromLlm : scope.outOfScope;
  if (resolvedOutScope.length > 0) {
    sections.push(sectionBlock("排除范围", resolvedOutScope));
  }

  // 功能要点
  if (biz?.functionalPoints?.length) {
    sections.push(sectionBlock("功能要点", biz.functionalPoints));
  }

  // 交互设计要点
  if (ii) {
    const iiLines: string[] = [];
    if (ii.primaryFlow?.length) iiLines.push(...ii.primaryFlow.map((item) => `[主流程] ${item}`));
    if (ii.keyInteractions?.length) iiLines.push(...ii.keyInteractions.map((item) => `[关键交互] ${item}`));
    if (ii.exceptionPaths?.length) iiLines.push(...ii.exceptionPaths.map((item) => `[异常路径] ${item}`));
    if (ii.usabilityRisks?.length) iiLines.push(...ii.usabilityRisks.map((item) => `[可用性风险] ${item}`));
    if (iiLines.length > 0) {
      sections.push(sectionBlock("交互设计要点", iiLines));
    }
  }

  // 成功标准
  if (biz?.successCriteria?.length) {
    sections.push(sectionBlock("成功标准", biz.successCriteria));
  }

  // 验收标准
  if (scope.acceptanceCriteria.length > 0) {
    sections.push(sectionBlock("验收标准", scope.acceptanceCriteria));
  }

  // 待确认事项
  if (biz?.confirmationChecklist?.length) {
    sections.push(sectionBlock("待确认事项", biz.confirmationChecklist));
  }

  // 版本差异（增强：附加 diffNarratives）
  if (biz?.versionDiffSummary) {
    const diffParts = [biz.versionDiffSummary];
    if (biz.diffNarratives?.length) {
      diffParts.push("", ...biz.diffNarratives.map((item) => `- ${item}`));
    }
    sections.push(joinLines("## 版本差异", ...diffParts));
  }

  return sections.length > 1 ? sections.join("\n\n") : "";
}

function synthesizePrototypePreview(iteration: Iteration): string {
  const state = iteration.interactionState;
  if (!state?.hasPrototypeAssets) return "";
  return joinLines(
    "# 原型与交互",
    `上传类型：${state.uploadKind}`,
    state.lastAttachmentName ? `最近附件：${state.lastAttachmentName}` : "",
    "原型内容通过 HTML 预览渲染，请在交互面板中查看。"
  );
}

function synthesizeDesignSpec(cc: ChangeControl): string {
  const ux = cc.uxArtifacts;
  if (!ux) return "";
  const sections: string[] = ["# 设计规范"];
  if (ux.informationArchitecture?.length > 0) {
    sections.push(sectionBlock("信息架构", ux.informationArchitecture));
  }
  if (ux.interactionFlows?.length > 0) {
    sections.push(sectionBlock("交互流程", ux.interactionFlows));
  }
  if (ux.uiStates?.length > 0) {
    sections.push(sectionBlock("界面状态", ux.uiStates));
  }
  if (ux.uxConstraints?.length > 0) {
    sections.push(sectionBlock("设计约束", ux.uxConstraints));
  }
  // 交互洞察补充（来自 LLM 分析）
  const designIi = cc.lastBusinessConfirmation?.interactionInsights;
  if (designIi) {
    const iiLines: string[] = [];
    if (designIi.usabilityRisks?.length) iiLines.push(...designIi.usabilityRisks.map((item) => `[可用性风险] ${item}`));
    if (designIi.exceptionPaths?.length) iiLines.push(...designIi.exceptionPaths.map((item) => `[异常路径] ${item}`));
    if (iiLines.length > 0) {
      sections.push(sectionBlock("风险与异常路径", iiLines));
    }
  }
  return sections.length > 1 ? sections.join("\n\n") : "";
}

function synthesizeTechnicalArchitecture(cc: ChangeControl): string {
  const boundary = cc.boundary;
  const ec = cc.executableConstraints;
  if (!boundary) return "";
  const sections: string[] = ["# 技术架构"];
  if (boundary.componentRefs.length > 0) {
    sections.push(sectionBlock("受影响模块", boundary.componentRefs));
  }
  if (boundary.codePaths.length > 0) {
    sections.push(sectionBlock("代码路径", boundary.codePaths));
  }
  if (ec?.componentWhitelist?.length) {
    const extra = ec.componentWhitelist.filter((c) => !boundary.componentRefs.includes(c));
    if (extra.length > 0) {
      sections.push(sectionBlock("组件白名单（补充）", extra));
    }
  }
  if (ec?.codePathWhitelist?.length) {
    const extra = ec.codePathWhitelist.filter((p) => !boundary.codePaths.includes(p));
    if (extra.length > 0) {
      sections.push(sectionBlock("代码路径白名单（补充）", extra));
    }
  }
  if (ec?.acceptanceChecks?.length) {
    sections.push(sectionBlock("技术验收检查", ec.acceptanceChecks));
  }
  return sections.length > 1 ? sections.join("\n\n") : "";
}

function synthesizeApiSpecification(cc: ChangeControl): string {
  const entries = cc.domainKnowledgeEntries;
  if (!Array.isArray(entries)) return "";
  const apiEntries = entries.filter((e) => e.mappedApis?.length > 0);
  if (apiEntries.length === 0) return "";
  const sections: string[] = ["# 接口设计"];

  const apiLines = apiEntries.slice(0, 20).map(
    (entry) => `**${entry.term}** → ${entry.mappedApis.join("、")}`
  );
  sections.push(sectionBlock("领域术语与接口映射", apiLines));

  return sections.join("\n\n");
}

function synthesizeDatabaseDesign(cc: ChangeControl): string {
  const entries = cc.domainKnowledgeEntries;
  if (!Array.isArray(entries)) return "";
  const entityEntries = entries.filter((e) => e.mappedEntities?.length > 0);
  if (entityEntries.length === 0) return "";
  const sections: string[] = ["# 数据模型设计"];

  const entityLines = entityEntries.slice(0, 20).map(
    (entry) => `**${entry.term}** → 实体字段：${entry.mappedEntities.join("、")}`
  );
  sections.push(sectionBlock("领域术语与实体映射", entityLines));

  return sections.join("\n\n");
}

function synthesizeCodeDelivery(iteration: Iteration, label: string): string {
  const link = iteration.codeLink;
  if (!link) return "";
  const hasContent = link.commit || link.pr || link.paths.length > 0;
  if (!hasContent) return "";
  const sections: string[] = [`# ${label}`];

  // 代码引用
  const refLines: string[] = [];
  if (link.branch) refLines.push(`分支：${link.branch}`);
  if (link.commit) refLines.push(`提交：${link.commit}`);
  if (link.pr) refLines.push(`PR：${link.pr}`);
  if (refLines.length > 0) {
    sections.push(joinLines("## 代码引用", ...refLines));
  }

  // 变更路径
  if (link.paths.length > 0) {
    sections.push(sectionBlock("变更路径", link.paths.slice(0, 20)));
  }

  // 备注
  if (link.note) {
    sections.push(joinLines("## 备注", link.note));
  }

  return sections.join("\n\n");
}

function synthesizeDeploymentPlan(cc: ChangeControl): string {
  const boundary = cc.boundary;
  const ec = cc.executableConstraints;
  const qa = cc.qualityArtifacts;
  const decision = cc.lastReleaseReviewDecision;

  const hasScope = (boundary?.componentRefs?.length ?? 0) > 0 || (boundary?.codePaths?.length ?? 0) > 0;
  const allChecks = Array.from(new Set([
    ...(qa?.acceptanceChecklist || []),
    ...(ec?.acceptanceChecks || [])
  ])).filter(Boolean);
  const hasChecklist = allChecks.length > 0;

  if (!decision && !hasScope && !hasChecklist) return "";
  const sections: string[] = ["# 部署方案"];

  // 发布前提（一行引用，不重复 release-review 详情）
  if (decision) {
    const label = decision === "go" ? "允许发布" : decision === "caution" ? "谨慎发布" : "阻塞发布";
    sections.push(joinLines("## 发布前提", `发布评审结论：${label}`));
  }

  // 部署范围
  if (hasScope) {
    const scopeLines: string[] = [];
    if (boundary.componentRefs.length > 0) {
      scopeLines.push(...boundary.componentRefs.map((c) => `[组件] ${c}`));
    }
    if (boundary.codePaths.length > 0) {
      scopeLines.push(...boundary.codePaths.slice(0, 12).map((p) => `[路径] ${p}`));
    }
    sections.push(sectionBlock("部署范围", scopeLines));
  }

  // 部署前检查清单
  if (hasChecklist) {
    sections.push(`## 部署前检查\n${allChecks.slice(0, 15).map((item) => `- [ ] ${item}`).join("\n")}`);
  }

  // 回滚策略
  const rollbackLines: string[] = [];
  if (cc.lastOpsRollbackSuggested) {
    rollbackLines.push("建议准备回滚方案");
  }
  const blockers = cc.lastReleaseReviewBlockers;
  if (Array.isArray(blockers) && blockers.length > 0) {
    rollbackLines.push(`回滚触发条件：${blockers.join("；")}`);
  }
  if (rollbackLines.length > 0) {
    sections.push(joinLines("## 回滚策略", ...rollbackLines));
  }

  // 部署后验证
  const matrix = cc.generatedTestMatrix || [];
  if (matrix.length > 0) {
    const passed = matrix.filter((tc) => tc.executionStatus === "passed").length;
    const total = matrix.length;
    sections.push(joinLines(
      "## 部署后验证",
      `测试用例 ${total} 个，已通过 ${passed} 个`,
      passed < total ? `需重点关注 ${total - passed} 个未通过用例` : "所有用例已通过"
    ));
  }

  return sections.length > 1 ? sections.join("\n\n") : "";
}

export function synthesizeArtifactDraftContent(
  artifactId: string,
  iteration: Iteration,
  cc: ChangeControl
): string {
  // 技术向交付物不做业务语言清洗
  const technicalArtifacts = new Set([
    "technical-architecture",
    "api-specification",
    "database-design",
    "frontend-code",
    "backend-code",
  ]);
  let content: string;
  switch (artifactId) {
    case "analysis-report":
      content = synthesizeAnalysisReport(iteration, cc);
      break;
    case "product-requirements-doc":
      content = synthesizeProductRequirementsDoc(iteration, cc);
      break;
    case "boundary-confirmation":
      content = synthesizeBoundary(cc);
      break;
    case "prototype-preview":
      content = synthesizePrototypePreview(iteration);
      break;
    case "design-spec":
      content = synthesizeDesignSpec(cc);
      break;
    case "technical-architecture":
      content = synthesizeTechnicalArchitecture(cc);
      break;
    case "api-specification":
      content = synthesizeApiSpecification(cc);
      break;
    case "database-design":
      content = synthesizeDatabaseDesign(cc);
      break;
    case "frontend-code":
      content = synthesizeCodeDelivery(iteration, "前端代码");
      break;
    case "backend-code":
      content = synthesizeCodeDelivery(iteration, "后端代码");
      break;
    case "test-matrix":
      content = synthesizeTestMatrix(cc);
      break;
    case "acceptance-checklist":
      content = synthesizeAcceptanceChecklist(cc);
      break;
    case "release-review":
      content = synthesizeReleaseReview(cc);
      break;
    case "deployment-plan":
      content = synthesizeDeploymentPlan(cc);
      break;
    case "delivery-package":
      content = synthesizeDeliveryPackage(iteration, cc);
      break;
    default:
      content = "";
  }
  if (!content || technicalArtifacts.has(artifactId)) return content;
  return sanitizeDisplayMarkdown(content);
}

/**
 * 检测合成内容是否有实质业务信息（而非纯占位符/格式壳）。
 * 返回 true 表示内容有效，可以 commit。
 *
 * 检测策略：
 * 1. 去掉 markdown 格式符后，纯文本长度 >= 80 字符
 * 2. 不是纯数字/单字符条目堆砌
 * 3. 无高重复率（同一短文本出现 > 3 次）
 */
export function isSubstantiveContent(draft: string): boolean {
  if (!draft || draft.trim().length < 100) return false;

  // 去掉 markdown 格式符（标题、列表、引用、分隔线、加粗斜体）
  const plain = draft
    .replace(/^#{1,6}\s+.*$/gm, "")     // 标题行
    .replace(/^[-*+]\s+/gm, "")          // 列表前缀
    .replace(/^>\s+/gm, "")              // 引用前缀
    .replace(/^---+$/gm, "")             // 分隔线
    .replace(/[*_`~]/g, "")              // 行内格式
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接
    .replace(/\s+/g, " ")
    .trim();

  // 纯文本去格式后太短
  if (plain.length < 60) return false;

  // 检查是否为纯数字/单字符条目堆砌（如 "1 1 1" 或 "a b c"）
  const tokens = plain.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const shortTokens = tokens.filter((t) => t.length <= 2);
  if (shortTokens.length / tokens.length > 0.7) return false;

  // 检查高重复率：最频繁的 token 占比 > 50%（排除常见虚词）
  const STOP_WORDS = new Set(["的", "了", "在", "是", "和", "与", "或", "等", "中", "为", "对"]);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    if (STOP_WORDS.has(t) || t.length <= 1) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const maxFreq = Math.max(0, ...freq.values());
  const meaningfulTokens = tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1).length;
  if (meaningfulTokens > 0 && maxFreq / meaningfulTokens > 0.5) return false;

  return true;
}
