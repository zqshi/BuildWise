import type { Iteration } from "../../domain/workspace/types";
import { defaultIterationChangeControl } from "./workspaceServiceCommon";

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
  const scope = iteration.scope;
  const assessment = iteration.assessment;
  const continuity = iteration.continuity;
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

  // 问题定义
  sections.push(joinLines(
    `## 问题定义`,
    Array.isArray(iteration.goals) ? iteration.goals.join("；") : "",
    scope.inScope.length > 0 ? `\n本轮范围：${scope.inScope.join("、")}` : "",
    scope.outOfScope.length > 0 ? `\n明确排除：${scope.outOfScope.join("、")}` : ""
  ));

  // 验收标准
  if (scope.acceptanceCriteria.length > 0) {
    sections.push(sectionBlock("验收标准", scope.acceptanceCriteria));
  }

  // 版本差异
  if (assessment?.deltaInScope?.length || assessment?.resolvedItems?.length) {
    const items: string[] = [];
    if (assessment.deltaInScope.length > 0) items.push(`新增范围：${assessment.deltaInScope.join("、")}`);
    if (assessment.resolvedItems.length > 0) items.push(`已解决：${assessment.resolvedItems.join("、")}`);
    if (assessment.pendingItems.length > 0) items.push(`待处理：${assessment.pendingItems.join("、")}`);
    if (items.length > 0) sections.push(sectionBlock("版本差异", items));
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

  // 关键发现 (P0/P1)
  if (cc.lastAnalysisP0Count !== undefined && cc.lastAnalysisP0Count > 0) {
    sections.push(`## 关键发现\nP0 级问题：${cc.lastAnalysisP0Count} 个，高优先级问题：${cc.lastAnalysisHighValueCount ?? 0} 个`);
  }

  // 分析覆盖
  if (cc.lastAnalysisConsideredFiles) {
    sections.push(joinLines(
      `## 分析范围`,
      `考虑文件数：${cc.lastAnalysisConsideredFiles}`,
      cc.lastAnalysisIgnoredFiles ? `忽略文件数：${cc.lastAnalysisIgnoredFiles}（${cc.lastAnalysisIgnoredFileRatio ?? 0}%）` : ""
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
  return sections.length > 1 ? sections.join("\n\n") : "";
}

function synthesizeTestMatrix(cc: ChangeControl): string {
  const matrix = Array.isArray(cc.generatedTestMatrix) ? cc.generatedTestMatrix : [];
  if (matrix.length === 0) return "";
  const sections = ["# 测试矩阵"];
  sections.push(`测试用例总数：${matrix.length}`);
  for (const tc of matrix.slice(0, 30)) {
    const statusLabel = tc.executionStatus === "passed" ? "通过" : tc.executionStatus === "failed" ? "失败" : tc.executionStatus || "待执行";
    sections.push(`- **${tc.caseId || "?"}** ${tc.focus || ""} — ${statusLabel}${tc.executionNote ? `（${tc.executionNote}）` : ""}`);
  }
  if (matrix.length > 30) sections.push(`...及其他 ${matrix.length - 30} 条用例`);
  return sections.join("\n");
}

function synthesizeReleaseReview(cc: ChangeControl): string {
  if (!cc.lastReleaseReviewDecision) return "";
  const sections = ["# 发布评审"];
  sections.push(`决策：${cc.lastReleaseReviewDecision === "go" ? "允许发布" : cc.lastReleaseReviewDecision === "caution" ? "谨慎发布" : "阻塞发布"}`);
  if (cc.lastReleaseReviewScore !== undefined) sections.push(`评分：${cc.lastReleaseReviewScore}`);
  if (cc.lastReleaseReviewReason) sections.push(`\n## 评审理由\n${cc.lastReleaseReviewReason}`);
  if (Array.isArray(cc.lastReleaseReviewBlockers) && cc.lastReleaseReviewBlockers.length > 0) {
    sections.push(sectionBlock("阻塞项", cc.lastReleaseReviewBlockers));
  }
  if (cc.lastOpsRollbackSuggested) {
    sections.push(`\n## 回滚建议\n建议回滚：是`);
  }
  return sections.join("\n");
}

function synthesizeAcceptanceChecklist(cc: ChangeControl): string {
  const checklist = cc.qualityArtifacts?.acceptanceChecklist;
  if (!Array.isArray(checklist) || checklist.length === 0) return "";
  return `# 验收清单\n\n${checklist.map((item) => `- [ ] ${item}`).join("\n")}`;
}

function synthesizeDeliveryPackage(iteration: Iteration, cc: ChangeControl): string {
  const files = cc.qualityArtifacts?.materializedFiles;
  if (!Array.isArray(files) || files.length === 0) return "";
  return `# 交付归档\n\n迭代：${iteration.name}\n状态：${iteration.status}\n\n## 归档文件\n${files.map((f) => `- ${f}`).join("\n")}`;
}

export function synthesizeArtifactDraftContent(
  artifactId: string,
  iteration: Iteration,
  cc: ChangeControl
): string {
  switch (artifactId) {
    case "analysis-report":
      return synthesizeAnalysisReport(iteration, cc);
    case "boundary-confirmation":
      return synthesizeBoundary(cc);
    case "test-matrix":
      return synthesizeTestMatrix(cc);
    case "acceptance-checklist":
      return synthesizeAcceptanceChecklist(cc);
    case "release-review":
      return synthesizeReleaseReview(cc);
    case "delivery-package":
      return synthesizeDeliveryPackage(iteration, cc);
    default:
      return "";
  }
}
