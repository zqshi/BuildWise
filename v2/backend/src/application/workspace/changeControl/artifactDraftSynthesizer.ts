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
  const appendix: string[] = [];

  // 继承上下文
  if (continuity?.inheritedFromIterationId) {
    sections.push(joinLines(
      `## 继承上下文`,
      continuity.inheritedSummary || `继承自迭代 ${continuity.inheritedFromIterationId}`,
      continuity.carriedGoals?.length ? `继承目标：${continuity.carriedGoals.join("、")}` : "",
      continuity.carriedRisks?.length ? `继承风险：${continuity.carriedRisks.join("、")}` : ""
    ));
  }

  // ── 核心章节（空数据时输出说明而非跳过） ──

  if (biz?.coreIntent) {
    sections.push(joinLines("## 核心意图", biz.coreIntent));
  } else {
    sections.push(joinLines("## 核心意图", "> 分析未能识别核心业务意图。可能原因：上传材料以代码为主，缺少需求描述文档。建议在对话中补充业务目标。"));
  }

  if (biz?.boundarySummary) {
    sections.push(joinLines("## 边界摘要", biz.boundarySummary));
  } else {
    sections.push(joinLines("## 边界摘要", "> 边界信息待补充。请通过「确认边界」操作明确本迭代的需求范围、受影响组件和代码路径。"));
  }

  if (biz?.functionalPoints?.length) {
    sections.push(sectionBlock("功能要点", biz.functionalPoints));
  } else {
    sections.push(joinLines("## 功能要点", "> 未提取到功能要点。请确认上传材料中包含功能描述，或在对话中逐条说明本迭代要实现的功能。"));
  }

  // 必要性评估
  const na = biz?.necessityAssessment;
  const naLines: string[] = [];
  if (na?.mustDo?.length) naLines.push(`必须完成：${na.mustDo.join("、")}`);
  if (na?.shouldDo?.length) naLines.push(`建议纳入：${na.shouldDo.join("、")}`);
  if (na?.canDefer?.length) naLines.push(`可延期：${na.canDefer.join("、")}`);
  if (na?.outOfScope?.length) naLines.push(`超出范围：${na.outOfScope.join("、")}`);
  if (na?.rationale) naLines.push(`判断依据：${na.rationale}`);
  if (naLines.length > 0) {
    sections.push(joinLines("## 必要性评估", ...naLines));
  } else {
    sections.push(joinLines("## 必要性评估", "> 未能评估必要性。请确认哪些功能必须在本迭代完成、哪些可以延期。"));
  }

  // 成功标准
  if (biz?.successCriteria?.length) {
    sections.push(sectionBlock("成功标准", biz.successCriteria));
  }

  // ── 洞察章节 ──

  // 交互洞察
  const reportIi = biz?.interactionInsights;
  if (reportIi) {
    const iiLines: string[] = [];
    if (reportIi.primaryFlow?.length) iiLines.push(...reportIi.primaryFlow.map((f) => `[主流程] ${f}`));
    if (reportIi.keyInteractions?.length) iiLines.push(...reportIi.keyInteractions.map((k) => `[关键交互] ${k}`));
    if (reportIi.exceptionPaths?.length) iiLines.push(...reportIi.exceptionPaths.map((e) => `[异常路径] ${e}`));
    if (reportIi.usabilityRisks?.length) iiLines.push(...reportIi.usabilityRisks.map((r) => `[可用性风险] ${r}`));
    if (iiLines.length > 0) sections.push(sectionBlock("交互洞察", iiLines));
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

  // ── 行动建议（汇总所有待办） ──
  const actionItems: string[] = [];
  const questions = cc.clarificationQuestions;
  if (Array.isArray(questions) && questions.length > 0) {
    actionItems.push(...questions.map((q) => `[待澄清] ${q}`));
  }
  if (Array.isArray(prioritized)) {
    const p0Items = prioritized.filter((i) => i.priority === "P0");
    actionItems.push(...p0Items.map((i) => `[阻断项] ${i.content}`));
  }
  const actionRequired = cc.lastReportQualityScore !== undefined
    ? (cc as Record<string, unknown>)["lastReportActionRequired"] as string[] | undefined
    : undefined;
  if (Array.isArray(actionRequired)) {
    actionItems.push(...actionRequired.filter(Boolean).map((a) => `[需补充] ${a}`));
  }
  if (biz?.confirmationChecklist?.length) {
    actionItems.push(...biz.confirmationChecklist.slice(0, 5).map((c) => `[待确认] ${c}`));
  }
  if (actionItems.length > 0) {
    sections.push(sectionBlock("行动建议", actionItems));
  }

  // 风险与建议
  const risks = assessment?.risks;
  if (Array.isArray(risks) && risks.length > 0) {
    sections.push(sectionBlock("已识别风险", risks));
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

  // ── 附录：分析元数据（与正文分离） ──
  if (cc.lastReportQualitySummary) {
    appendix.push(joinLines(
      `### 分析质量`,
      `评分：${cc.lastReportQualityScore ?? "-"}`,
      cc.lastReportQualitySummary,
      cc.lastReportPublishable === false ? "状态：报告尚未达到可发布标准" : ""
    ));
  }
  if (cc.traceabilitySnapshot?.requirementCoverage !== undefined) {
    const ts = cc.traceabilitySnapshot;
    appendix.push(joinLines(
      `### 追溯覆盖`,
      `需求覆盖率：${ts.requirementCoverage}%`,
      `映射置信度：${ts.mappingConfidence || "-"}`,
      ts.unmappedRequirements?.length ? `未映射需求：${ts.unmappedRequirements.join("、")}` : ""
    ));
  }

  if (sections.length === 0) return "";
  const header = continuity?.inheritedFromIterationId ? "# 继承差异分析报告" : "# 首版需求分析报告";
  const body = `${header}\n\n${sections.join("\n\n")}`;
  if (appendix.length === 0) return body;
  return `${body}\n\n---\n\n## 附录：分析元数据\n\n${appendix.join("\n\n")}`;
}

function synthesizeBoundary(cc: ChangeControl): string {
  const b = cc.boundary;
  const sections: string[] = ["# 变更边界确认"];

  // 业务边界说明
  const biz = cc.lastBusinessConfirmation;
  if (biz?.boundarySummary) {
    sections.push(joinLines("## 业务边界说明", biz.boundarySummary));
  }

  // 需求映射
  if (b?.requirementRefs?.length) {
    sections.push(sectionBlock("需求映射", b.requirementRefs));
  }
  // 受影响组件
  if (b?.componentRefs?.length) {
    sections.push(sectionBlock("受影响组件", b.componentRefs));
  }
  // 代码路径
  if (b?.codePaths?.length) {
    sections.push(sectionBlock("代码路径", b.codePaths));
  }
  if (b?.note) {
    sections.push(joinLines("## 备注", b.note));
  }

  // 验收检查项
  const ec = cc.executableConstraints;
  if (ec?.acceptanceChecks?.length) {
    sections.push(sectionBlock("验收检查项", ec.acceptanceChecks));
  }

  // 必要性依据 + 明确排除项
  const boundaryNa = biz?.necessityAssessment;
  if (boundaryNa?.rationale) {
    sections.push(joinLines("## 必要性依据", boundaryNa.rationale));
  }
  if (boundaryNa?.outOfScope?.length) {
    sections.push(sectionBlock("明确排除项", boundaryNa.outOfScope));
  }

  // 边界完整度提示
  const filled = [
    (b?.requirementRefs?.length ?? 0) > 0,
    (b?.componentRefs?.length ?? 0) > 0,
    (b?.codePaths?.length ?? 0) > 0
  ].filter(Boolean).length;
  if (filled < 2) {
    const missing: string[] = [];
    if (!(b?.requirementRefs?.length)) missing.push("需求映射");
    if (!(b?.componentRefs?.length)) missing.push("受影响组件");
    if (!(b?.codePaths?.length)) missing.push("代码路径");
    sections.push(joinLines("## 待补充", `> 边界确认尚未完整，缺少：${missing.join("、")}。建议补充后再进入下一阶段。`));
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

  // 建议行动
  const actions: string[] = [];
  if (cc.lastReleaseReviewDecision === "block") {
    actions.push("解决所有阻塞项后重新触发发布评审");
    if (Array.isArray(cc.lastReleaseReviewBlockers)) {
      actions.push(...cc.lastReleaseReviewBlockers.map((b) => `修复：${b}`));
    }
  } else if (cc.lastReleaseReviewDecision === "caution") {
    actions.push("建议人工复核后再决定是否发布");
    if (cc.lastOpsRollbackSuggested) actions.push("准备回滚方案");
  } else {
    actions.push("可执行发布流程");
  }
  if (actions.length > 0) {
    sections.push(sectionBlock("建议行动", actions));
  }

  // 发布门禁清单
  const gateItems: string[] = [];
  const matrix = cc.generatedTestMatrix || [];
  const totalTests = matrix.length;
  const passedTests = matrix.filter((tc) => tc.executionStatus === "passed").length;
  if (totalTests > 0) {
    gateItems.push(passedTests === totalTests ? `测试全部通过（${totalTests}/${totalTests}）` : `测试通过 ${passedTests}/${totalTests}，存在未通过用例`);
  }
  if (cc.confirmedAt) gateItems.push(`分析报告已确认（${cc.confirmedAt.slice(0, 10)}）`);
  const boundaryFilled = (cc.boundary?.componentRefs?.length ?? 0) + (cc.boundary?.codePaths?.length ?? 0);
  if (boundaryFilled > 0) gateItems.push(`变更边界已确认（${boundaryFilled} 项）`);
  if (gateItems.length > 0) {
    sections.push(sectionBlock("发布门禁检查", gateItems));
  }

  // 回滚建议
  if (cc.lastOpsRollbackSuggested) {
    sections.push(joinLines("## 回滚建议", "建议准备回滚方案，确保发布后出现问题时可快速恢复。"));
  }

  return sections.join("\n\n");
}

function synthesizeAcceptanceChecklist(iteration: Iteration, cc: ChangeControl): string {
  const checklist = cc.qualityArtifacts?.acceptanceChecklist;
  const ecChecks = cc.executableConstraints?.acceptanceChecks;
  const scopeChecks = iteration.scope?.acceptanceCriteria;

  const allItems: Array<{ text: string; source: string }> = [];
  const seen = new Set<string>();

  // 来源标注：scope → qualityArtifacts → executableConstraints
  if (Array.isArray(scopeChecks)) {
    for (const item of scopeChecks) {
      const t = item.trim();
      if (t && !seen.has(t)) { seen.add(t); allItems.push({ text: t, source: "需求范围" }); }
    }
  }
  if (Array.isArray(checklist)) {
    for (const item of checklist) {
      const t = item.trim();
      if (t && !seen.has(t)) { seen.add(t); allItems.push({ text: t, source: "质量评审" }); }
    }
  }
  if (Array.isArray(ecChecks)) {
    for (const item of ecChecks) {
      const t = item.trim();
      if (t && !seen.has(t)) { seen.add(t); allItems.push({ text: t, source: "自动生成" }); }
    }
  }

  if (allItems.length === 0) return "";
  const sections: string[] = ["# 验收清单"];

  sections.push(joinLines("## 概览", `共 ${allItems.length} 项验收检查，来源分布：需求范围 ${allItems.filter((i) => i.source === "需求范围").length} 项、质量评审 ${allItems.filter((i) => i.source === "质量评审").length} 项、自动生成 ${allItems.filter((i) => i.source === "自动生成").length} 项`));

  sections.push(`## 验收检查项\n${allItems.map((item) => `- [ ] ${item.text}（${item.source}）`).join("\n")}`);

  return sections.join("\n\n");
}

function synthesizeDeliveryPackage(iteration: Iteration, cc: ChangeControl): string {
  const files = cc.qualityArtifacts?.materializedFiles;
  if (!Array.isArray(files) || files.length === 0) return "";
  const sections: string[] = ["# 交付归档"];
  const biz = cc.lastBusinessConfirmation;

  // 迭代成果摘要
  const summaryLines: string[] = [`迭代名称：${iteration.name}`, `状态：${iteration.status}`];
  if (biz?.coreIntent) summaryLines.push(`核心意图：${biz.coreIntent}`);
  const workflowItems = cc.artifactWorkflow?.items || [];
  const readyCount = workflowItems.filter((i) => i.status === "ready").length;
  const totalCount = workflowItems.length;
  if (totalCount > 0) summaryLines.push(`交付物完成度：${readyCount}/${totalCount}`);
  if (cc.lastReportQualityScore !== undefined) summaryLines.push(`质量评分：${cc.lastReportQualityScore}`);
  sections.push(joinLines("## 迭代成果", ...summaryLines));

  // 归档文件清单
  sections.push(sectionBlock("归档文件", files));

  // 关键交付成果
  const keyDeliverables: string[] = [];
  if (cc.confirmedAt) keyDeliverables.push(`分析报告已确认（${cc.confirmedAt.slice(0, 10)}）`);
  const matrix = cc.generatedTestMatrix || [];
  if (matrix.length > 0) {
    const passed = matrix.filter((tc) => tc.executionStatus === "passed").length;
    keyDeliverables.push(`测试用例 ${matrix.length} 个，通过 ${passed} 个`);
  }
  if (cc.lastReleaseReviewDecision) {
    const label = cc.lastReleaseReviewDecision === "go" ? "允许发布" : cc.lastReleaseReviewDecision === "caution" ? "谨慎发布" : "阻塞发布";
    keyDeliverables.push(`发布评审：${label}`);
  }
  if (keyDeliverables.length > 0) {
    sections.push(sectionBlock("关键交付成果", keyDeliverables));
  }

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

function synthesizePrototypePreview(iteration: Iteration, cc: ChangeControl): string {
  const state = iteration.interactionState;
  const sections: string[] = ["# 原型与交互"];

  if (state?.hasPrototypeAssets) {
    const infoLines: string[] = [];
    if (state.uploadKind) infoLines.push(`上传类型：${state.uploadKind}`);
    if (state.lastAttachmentName) infoLines.push(`最近附件：${state.lastAttachmentName}`);
    infoLines.push("原型内容通过 HTML 预览渲染，请在交互面板中查看。");
    sections.push(joinLines("## 原型资产", ...infoLines));
  } else {
    sections.push(joinLines("## 原型资产", "> 未检测到原型附件。如需交互验证，请上传 HTML 原型文件或截图。"));
  }

  // 原型验证焦点
  const ii = cc.lastBusinessConfirmation?.interactionInsights;
  const focusItems: string[] = [];
  if (ii?.primaryFlow?.length) focusItems.push(...ii.primaryFlow.map((f) => `[主流程验证] ${f}`));
  if (ii?.exceptionPaths?.length) focusItems.push(...ii.exceptionPaths.map((e) => `[异常路径验证] ${e}`));
  if (ii?.usabilityRisks?.length) focusItems.push(...ii.usabilityRisks.map((r) => `[可用性风险] ${r}`));
  const ux = cc.uxArtifacts;
  if (ux?.uiStates?.length) focusItems.push(...ux.uiStates.slice(0, 4).map((s) => `[界面状态] ${s}`));
  if (ux?.interactionFlows?.length) focusItems.push(...ux.interactionFlows.slice(0, 4).map((f) => `[交互流程] ${f}`));
  if (focusItems.length > 0) {
    sections.push(sectionBlock("原型验证焦点", focusItems.slice(0, 12)));
  }

  return sections.length > 1 ? sections.join("\n\n") : "";
}

function synthesizeDesignSpec(cc: ChangeControl): string {
  const ux = cc.uxArtifacts;
  const ii = cc.lastBusinessConfirmation?.interactionInsights;
  const fp = cc.lastBusinessConfirmation?.functionalPoints;
  const sections: string[] = ["# 设计规范"];

  // 信息架构
  if (ux?.informationArchitecture?.length) {
    sections.push(sectionBlock("信息架构", ux.informationArchitecture.map((item, i) => `${i + 1}. ${item}`)));
  }

  // 交互流程（合并 ux + interactionInsights，标注场景类型）
  const flowItems: string[] = [];
  if (ux?.interactionFlows?.length) flowItems.push(...ux.interactionFlows.map((f) => `[流程] ${f}`));
  if (ii?.primaryFlow?.length) flowItems.push(...ii.primaryFlow.map((f) => `[主流程] ${f}`));
  if (ii?.exceptionPaths?.length) flowItems.push(...ii.exceptionPaths.map((e) => `[异常路径] ${e}`));
  if (flowItems.length > 0) {
    sections.push(sectionBlock("交互流程", flowItems));
  }

  // 界面状态
  if (ux?.uiStates?.length) {
    sections.push(sectionBlock("界面状态", ux.uiStates));
  }

  // 设计约束
  if (ux?.uxConstraints?.length) {
    sections.push(sectionBlock("设计约束", ux.uxConstraints));
  }

  // 风险与异常路径
  const riskItems: string[] = [];
  if (ii?.usabilityRisks?.length) riskItems.push(...ii.usabilityRisks.map((item) => `[可用性风险] ${item}`));
  if (ii?.keyInteractions?.length) riskItems.push(...ii.keyInteractions.map((item) => `[关键交互] ${item}`));
  if (riskItems.length > 0) {
    sections.push(sectionBlock("风险与关键交互", riskItems));
  }

  // 功能覆盖对照
  if (fp?.length) {
    sections.push(sectionBlock("需覆盖的功能要点", fp.slice(0, 10)));
  }

  if (sections.length <= 1) {
    sections.push(joinLines("> 交互设计数据待生成。请先完成需求分析，或通过 UX 规格生成获取设计规范。"));
  }
  return sections.join("\n\n");
}

function synthesizeTechnicalArchitecture(cc: ChangeControl): string {
  const boundary = cc.boundary;
  const ec = cc.executableConstraints;
  const deep = cc.lastDeepInsightsSummary;
  const prioritized = cc.lastPrioritizedFindings;
  const domainEntries = cc.domainKnowledgeEntries;
  const sections: string[] = ["# 技术架构"];

  // 受影响模块
  if (boundary?.componentRefs?.length) {
    sections.push(sectionBlock("受影响模块", boundary.componentRefs));
  }
  // 代码路径
  if (boundary?.codePaths?.length) {
    sections.push(sectionBlock("代码路径", boundary.codePaths));
  }
  // 组件/路径白名单补充
  if (ec?.componentWhitelist?.length) {
    const extra = ec.componentWhitelist.filter((c) => !boundary?.componentRefs?.includes(c));
    if (extra.length > 0) sections.push(sectionBlock("组件白名单（补充）", extra));
  }
  if (ec?.codePathWhitelist?.length) {
    const extra = ec.codePathWhitelist.filter((p) => !boundary?.codePaths?.includes(p));
    if (extra.length > 0) sections.push(sectionBlock("代码路径白名单（补充）", extra));
  }

  // 技术决策建议
  if (deep?.decisionSuggestions?.length) {
    sections.push(sectionBlock("技术决策建议", deep.decisionSuggestions));
  }

  // 技术风险
  const riskItems: string[] = [];
  if (deep?.rootCauses?.length) riskItems.push(...deep.rootCauses.map((r) => `[根因] ${r}`));
  if (Array.isArray(prioritized)) {
    const techRisks = prioritized.filter((i) => i.priority === "P0" || i.priority === "P1");
    riskItems.push(...techRisks.map((i) => `[${i.priority}] ${i.content}`));
  }
  if (riskItems.length > 0) sections.push(sectionBlock("技术风险", riskItems.slice(0, 10)));

  // 模块依赖关系
  if (Array.isArray(domainEntries)) {
    const depItems = domainEntries
      .filter((e) => e.mappedCodePaths?.length > 0)
      .slice(0, 10)
      .map((e) => `**${e.term}** → ${e.mappedCodePaths.join("、")}`);
    if (depItems.length > 0) sections.push(sectionBlock("模块依赖映射", depItems));
  }

  // 技术验收检查
  if (ec?.acceptanceChecks?.length) {
    sections.push(sectionBlock("技术验收检查", ec.acceptanceChecks));
  }

  if (sections.length <= 1) {
    sections.push(joinLines("> 技术架构数据待生成。请先完成需求分析和边界确认。"));
  }
  return sections.join("\n\n");
}

function synthesizeApiSpecification(cc: ChangeControl): string {
  const entries = cc.domainKnowledgeEntries;
  if (!Array.isArray(entries)) return "";
  const apiEntries = entries.filter((e) => e.mappedApis?.length > 0);
  if (apiEntries.length === 0) {
    return joinLines("# 接口设计", "> 领域知识中未提取到接口映射。请先完成需求分析，确保上传材料中包含接口相关描述。");
  }
  const sections: string[] = ["# 接口设计"];

  for (const entry of apiEntries.slice(0, 15)) {
    const lines: string[] = [`### ${entry.term}`];
    if (entry.definition) lines.push(entry.definition);
    lines.push(`接口：${entry.mappedApis.join("、")}`);
    if (entry.mappedPages?.length) lines.push(`关联页面：${entry.mappedPages.join("、")}`);
    if (entry.evidence) lines.push(`证据来源：${entry.evidence}`);
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

function synthesizeDatabaseDesign(cc: ChangeControl): string {
  const entries = cc.domainKnowledgeEntries;
  if (!Array.isArray(entries)) return "";
  const entityEntries = entries.filter((e) => e.mappedEntities?.length > 0);
  if (entityEntries.length === 0) {
    return joinLines("# 数据模型设计", "> 领域知识中未提取到实体映射。请先完成需求分析，确保上传材料中包含数据模型相关描述。");
  }
  const sections: string[] = ["# 数据模型设计"];

  for (const entry of entityEntries.slice(0, 15)) {
    const lines: string[] = [`### ${entry.term}`];
    if (entry.definition) lines.push(entry.definition);
    lines.push(`实体字段：${entry.mappedEntities.join("、")}`);
    if (entry.mappedCodePaths?.length) lines.push(`关联代码路径：${entry.mappedCodePaths.join("、")}`);
    if (entry.mappedApis?.length) lines.push(`关联接口：${entry.mappedApis.join("、")}`);
    if (entry.evidence) lines.push(`证据来源：${entry.evidence}`);
    sections.push(lines.join("\n"));
  }

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
  const biz = cc.lastBusinessConfirmation;

  const hasScope = (boundary?.componentRefs?.length ?? 0) > 0 || (boundary?.codePaths?.length ?? 0) > 0;
  const allChecks = Array.from(new Set([
    ...(qa?.acceptanceChecklist || []),
    ...(ec?.acceptanceChecks || [])
  ])).filter(Boolean);
  const hasChecklist = allChecks.length > 0;

  if (!decision && !hasScope && !hasChecklist) return "";
  const sections: string[] = ["# 部署方案"];

  // 部署背景
  if (biz?.coreIntent) {
    sections.push(joinLines("## 部署背景", biz.coreIntent));
  }

  // 发布前提（一行引用，不重复 release-review 详情）
  if (decision) {
    const label = decision === "go" ? "允许发布" : decision === "caution" ? "谨慎发布" : "阻塞发布";
    sections.push(joinLines("## 发布前提", `发布评审结论：${label}`));
    if (decision === "block") {
      sections.push(joinLines("> 当前评审为阻塞状态，建议解决阻塞项后再执行部署。"));
    }
  }

  // 部署范围（带业务关联）
  if (hasScope) {
    const scopeLines: string[] = [];
    if (boundary.componentRefs.length > 0) {
      scopeLines.push(...boundary.componentRefs.map((c) => `[组件] ${c}`));
    }
    if (boundary.codePaths.length > 0) {
      scopeLines.push(...boundary.codePaths.slice(0, 12).map((p) => `[路径] ${p}`));
    }
    sections.push(sectionBlock("部署范围", scopeLines));

    // 关联功能要点
    if (biz?.functionalPoints?.length) {
      sections.push(sectionBlock("关联功能要点", biz.functionalPoints.slice(0, 6)));
    }
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
      content = synthesizePrototypePreview(iteration, cc);
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
      content = synthesizeAcceptanceChecklist(iteration, cc);
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
