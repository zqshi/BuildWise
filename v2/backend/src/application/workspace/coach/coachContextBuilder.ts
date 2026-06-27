/**
 * Coach 上下文构建 —— 将迭代/项目/门禁状态序列化为 LLM 可读的自然语言上下文片段。
 * 依赖单向：仅引用 domain 类型 + 同层 sanitizer/evaluator，不引用 orchestrateCoachMessage。
 */

import type { WorkspaceRepository } from '../../../domain/workspace/repository';
import type { Iteration } from '../../../domain/workspace/types';
import type { Project } from '../../../domain/workspace/projectTypes';
import type { IterationArtifactStage } from '../../../domain/workspace/iterationTypes';
import { normalizeIterationMessageContent, sanitizeForCoachContext } from './messageSanitizer';
import { STAGE_LABELS } from './stageAgents';
import type { evaluateCurrentStageGate } from './stageGateEvaluator';
import { buildKnowledgeSyncContext } from '../project/knowledgeSyncService';
import { isLowSignalText } from '../analysis/extractors';
function serializeIterationScopeContext(
  iteration: Iteration,
  previous: Iteration | null,
  stage: IterationArtifactStage,
  parts: string[]
) {
  parts.push(
    `当前迭代「${iteration.name}」处于「${STAGE_LABELS[stage]}」阶段。${previous ? `上一轮迭代是「${previous.name}」。` : "这是第一轮迭代。"}`
  );
  if (iteration.scope.inScope.length > 0) {
    parts.push(`本轮范围：${iteration.scope.inScope.join("、")}。`);
  }
  if (iteration.scope.outOfScope.length > 0) {
    parts.push(`明确不做：${iteration.scope.outOfScope.join("、")}。`);
  }
  if (iteration.changeControl?.lastAnalysisAt) {
    parts.push(`最近分析时间：${iteration.changeControl.lastAnalysisAt}。`);
  }
  if (iteration.changeControl?.confirmedAt) {
    parts.push("分析报告已确认。");
  }
  const boundary = iteration.changeControl?.boundary;
  if (boundary && boundary.requirementRefs.length > 0) {
    parts.push(`变更边界：需求 ${boundary.requirementRefs.length} 项，组件 ${boundary.componentRefs.length} 项，代码路径 ${boundary.codePaths.length} 条。`);
  }
  const biz = iteration.changeControl?.lastBusinessConfirmation;
  if (biz?.coreIntent && !isLowSignalText(biz.coreIntent)) {
    const bizParts: string[] = [`分析结论：${biz.coreIntent}`];
    if (biz.boundarySummary) bizParts.push(`边界摘要：${biz.boundarySummary}`);
    const na = biz.necessityAssessment;
    if (na?.mustDo?.length) bizParts.push(`必须完成：${na.mustDo.join("、")}`);
    if (na?.outOfScope?.length) bizParts.push(`明确排除：${na.outOfScope.join("、")}`);
    if (biz.functionalPoints?.length) bizParts.push(`功能要点：${biz.functionalPoints.slice(0, 6).join("、")}`);
    parts.push(bizParts.join("\n"));
  }
}

function serializeGateAndWorkflowContext(
  iteration: Iteration,
  project: Project | null,
  gateResult: ReturnType<typeof evaluateCurrentStageGate>,
  parts: string[]
) {
  const knowledgeCtx = buildKnowledgeSyncContext(project?.knowledgeBase ?? null);
  if (knowledgeCtx) parts.push(knowledgeCtx);
  const unresolved = iteration.changeControl?.lastClarificationResolution?.unresolvedQuestions ?? [];
  if (unresolved.length > 0) {
    parts.push(`未解决的澄清问题：${unresolved.join("；")}。`);
  }
  if (gateResult.missingArtifacts.length > 0) {
    parts.push(`本阶段还缺少：${gateResult.missingArtifacts.join("、")}。`);
  }
  if (gateResult.canProceed) {
    parts.push("本阶段出口条件已满足，可以推进到下一阶段。");
  }
  const workflow = iteration.changeControl?.artifactWorkflow;
  if (workflow) {
    const readyItems = workflow.items
      .filter((i) => i.status === "ready" && i.outputVersion > 0)
      .map((i) => i.title);
    if (readyItems.length > 0) {
      parts.push(`已完成的交付物：${readyItems.join("、")}。这些交付物无需重复声明。`);
    }
  }
  if (project?.repository?.url) {
    parts.push(`项目已配置代码仓库（${project.repository.url}）。`);
  }
}

export function buildStageContext(
  iteration: Iteration,
  previous: Iteration | null,
  project: Project | null,
  stage: IterationArtifactStage,
  gateResult: ReturnType<typeof evaluateCurrentStageGate>
): string {
  const parts: string[] = [];
  serializeIterationScopeContext(iteration, previous, stage, parts);
  serializeGateAndWorkflowContext(iteration, project, gateResult, parts);
  return parts.filter(Boolean).join("\n");
}

export function loadRecentMessages(repo: WorkspaceRepository, iterationId: number) {
  return repo
    .listMessages(iterationId)
    .filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-8);
}

export function formatRecentConversation(messages: Array<{ role: string; content: string }>): string {
  const lines = messages.map((item, idx) => {
    const roleLabel = item.role === "user" ? "用户" : "教练";
    const content = sanitizeForCoachContext(
      normalizeIterationMessageContent(item.role as "user" | "assistant", item.content).slice(0, 400).replace(/\s+/g, " ")
    );
    return `  ${idx + 1}. ${roleLabel}：${content}`;
  });
  if (lines.length === 0) return "";
  return `最近对话：\n${lines.join("\n")}`;
}
