import type { Iteration, Project, ProjectKnowledgeBase } from "../../domain/workspace/types";
import type { ProjectKnowledgeShard } from "./projectWorkspaceKnowledgeTypes";

function isoDay(value: string) {
  return value.slice(0, 10);
}

function summarizeIteration(iteration: Iteration) {
  const releaseDecision = iteration.changeControl?.lastReleaseReviewDecision || "-";
  const boundary = iteration.changeControl?.boundary;
  const boundarySummary =
    boundary && (boundary.requirementRefs.length > 0 || boundary.componentRefs.length > 0 || boundary.codePaths.length > 0)
      ? `需求=${boundary.requirementRefs.join("、") || "-"}；组件=${boundary.componentRefs.join("、") || "-"}；代码=${boundary.codePaths.join("、") || "-"}`
      : "边界未收敛";
  return [
    `- 迭代 ${iteration.name}（${iteration.status}）`,
    `  目标：${iteration.goals.join("；") || "未填写"}`,
    `  范围：${iteration.scope.inScope.join("；") || "未填写"}`,
    `  发布结论：${releaseDecision}`,
    `  边界：${boundarySummary}`
  ].join("\n");
}

export function buildProjectSummaryDoc(project: Project, iterations: Iteration[]) {
  const latestIterations = [...iterations].sort((a, b) => b.id - a.id).slice(0, 5);
  return [
    `# ${project.name}`,
    "",
    `- 项目状态：${project.status}`,
    `- 项目描述：${project.description || "暂无描述"}`,
    `- 最近更新：${project.lastUpdated || "-"}`,
    `- 迭代数：${iterations.length}`,
    "",
    "## 最近迭代",
    latestIterations.length > 0 ? latestIterations.map((item) => summarizeIteration(item)).join("\n\n") : "- 暂无迭代",
  ].join("\n");
}

export function buildBusinessOntologyDoc(project: ProjectKnowledgeBase) {
  return [
    "# 业务本体与规则",
    "",
    "## 业务术语",
    project.ontologyTerms.length > 0
      ? project.ontologyTerms.map((item) => `- ${item.term}${item.aliases.length > 0 ? `（${item.aliases.join(" / ")}）` : ""}：${item.definition}`).join("\n")
      : "- 暂无业务术语",
    "",
    "## 稳定规则",
    project.stableRules.length > 0
      ? project.stableRules.map((item) => `- ${item.rule}｜来源：${item.source || "-"}｜原因：${item.rationale || "-"}`).join("\n")
      : "- 暂无稳定规则",
  ].join("\n");
}

export function buildTechnicalOntologyDoc(project: ProjectKnowledgeBase) {
  return [
    "# 技术本体映射",
    "",
    "## 功能模块 / 组件",
    project.componentInventory.length > 0
      ? project.componentInventory
          .map((item) => `- ${item.component}：${item.responsibility}｜需求：${item.relatedRequirements.join("、") || "-"}｜代码：${item.relatedCodePaths.join("、") || "-"}`)
          .join("\n")
      : "- 暂无组件映射",
    "",
    "## 能力到代码映射",
    project.codeMap.length > 0
      ? project.codeMap.map((item) => `- ${item.capability} → ${item.codePaths.join("、") || "未映射"}｜测试：${item.tests.join("、") || "-"}`).join("\n")
      : "- 暂无代码映射",
  ].join("\n");
}

export function buildDecisionRiskDoc(project: ProjectKnowledgeBase) {
  return [
    "# 决策、风险与模式",
    "",
    "## 决策日志",
    project.decisionLog.length > 0
      ? project.decisionLog.map((item) => `- ${item.decision}｜状态：${item.status}｜版本：${item.iterationVersion || "-"}｜原因：${item.rationale || "-"}`).join("\n")
      : "- 暂无决策日志",
    "",
    "## 已知风险",
    project.knownRisks.length > 0
      ? project.knownRisks.map((item) => `- ${item.risk}｜缓解：${item.mitigation || "-"}｜触发：${item.trigger || "-"}`).join("\n")
      : "- 暂无已知风险",
    "",
    "## 变更模式",
    project.changePatterns.length > 0
      ? project.changePatterns.map((item) => `- ${item.pattern}｜推荐流程：${item.preferredFlow || "-"}｜避免：${item.avoid || "-"}`).join("\n")
      : "- 暂无变更模式",
  ].join("\n");
}

export function buildReleaseHistoryDoc(iterations: Iteration[]) {
  const released = [...iterations]
    .filter((item) => item.changeControl?.lastReleaseReviewUpdatedAt)
    .sort((a, b) => (b.changeControl?.lastReleaseReviewUpdatedAt || "").localeCompare(a.changeControl?.lastReleaseReviewUpdatedAt || ""))
    .slice(0, 10);
  return [
    "# 发布与迭代历史",
    "",
    released.length > 0
      ? released
          .map((item) => {
            const release = item.changeControl;
            return `- ${item.name}｜结论：${release?.lastReleaseReviewDecision || "-"}｜评分：${release?.lastReleaseReviewScore || 0}｜时间：${release?.lastReleaseReviewUpdatedAt || "-"}`;
          })
          .join("\n")
      : "- 暂无发布记录",
  ].join("\n");
}

export function buildDailySummaryDoc(project: Project, iterations: Iteration[], now: string) {
  const today = isoDay(now);
  const todaysIterations = iterations.filter((item) => isoDay(item.createdAt) === today || isoDay(item.changeControl?.lastAnalysisAt || "") === today);
  const recentNames = todaysIterations.slice(0, 6).map((item) => item.name).join("、") || "无新增迭代事件";
  const releaseDecisions = todaysIterations
    .map((item) => `${item.name}:${item.changeControl?.lastReleaseReviewDecision || "-"}`)
    .join("；") || "无发布评审变化";

  return [
    `# ${project.name} 每日记忆汇总`,
    "",
    `- 日期：${today}`,
    `- 今日活跃迭代：${recentNames}`,
    `- 今日发布结论：${releaseDecisions}`,
    "",
    "## 汇总说明",
    "该文档由 BuildWise 后端定时生成，用于为项目 workspace 提供稳定的每日记忆基线。",
  ].join("\n");
}

export function buildShards(project: Project, kb: ProjectKnowledgeBase, iterations: Iteration[], now: string): ProjectKnowledgeShard[] {
  const releaseDoc = buildReleaseHistoryDoc(iterations);
  const dailyDoc = buildDailySummaryDoc(project, iterations, now);
  return [
    {
      id: `project-${project.id}-summary`,
      type: "project-summary",
      title: `${project.name} 项目摘要`,
      content: buildProjectSummaryDoc(project, iterations),
      tags: ["project", project.name, project.status],
      source: "project",
      updatedAt: now
    },
    {
      id: `project-${project.id}-business-ontology`,
      type: "business-ontology",
      title: `${project.name} 业务本体`,
      content: buildBusinessOntologyDoc(kb),
      tags: ["business", "ontology", "rules"],
      source: "knowledge-base",
      updatedAt: now
    },
    {
      id: `project-${project.id}-technical-ontology`,
      type: "technical-ontology",
      title: `${project.name} 技术本体`,
      content: buildTechnicalOntologyDoc(kb),
      tags: ["technical", "components", "code-map"],
      source: "knowledge-base",
      updatedAt: now
    },
    {
      id: `project-${project.id}-decisions`,
      type: "decisions",
      title: `${project.name} 决策与风险`,
      content: buildDecisionRiskDoc(kb),
      tags: ["decisions", "risks", "patterns"],
      source: "knowledge-base",
      updatedAt: now
    },
    {
      id: `project-${project.id}-release-history`,
      type: "release-history",
      title: `${project.name} 发布历史`,
      content: releaseDoc,
      tags: ["release", "history"],
      source: "iterations",
      updatedAt: now
    },
    {
      id: `project-${project.id}-daily-${isoDay(now)}`,
      type: "daily-summary",
      title: `${project.name} 每日汇总 ${isoDay(now)}`,
      content: dailyDoc,
      tags: ["daily", "summary", isoDay(now)],
      source: "scheduler",
      updatedAt: now
    }
  ];
}
