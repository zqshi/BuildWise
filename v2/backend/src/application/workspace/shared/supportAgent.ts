import type { AgentScope, AttachmentAnalysisReport, Iteration, IterationAgentPlan, IterationAgentPrompt, IterationStatus } from '../../../domain/workspace/types';
import { loadAgentPromptTemplate, loadWorkflowTemplate, type AgentPromptTemplate } from "./agentAssetRegistry";
import { RISK_SENTINEL } from '../../../domain/workspace/constants';
import { formatDiffLocations, formatBoundaries } from '../analysis/extractors';

export function inferCyclePhase(status: IterationStatus): AttachmentAnalysisReport["cyclePhase"] {
  switch (status) {
    case "planned":
      return "scope-clarified";
    case "in-progress":
      return "build-in-progress";
    case "review":
      return "qa-review";
    case "completed":
      return "ready-for-release";
    case "blocked":
      return "task-planning";
    default:
      return "task-planning";
  }
}

function suggestNextTransition(status: IterationStatus, risks: string[], diffCount: number): IterationStatus | null {
  const hasRisk = risks.length > 0 && !risks.every((item) => item.includes(RISK_SENTINEL));
  if (status === "planned") {
    return "in-progress";
  }
  if (status === "in-progress") {
    if (hasRisk) {
      return "blocked";
    }
    return diffCount > 0 ? "review" : "in-progress";
  }
  if (status === "review") {
    return hasRisk ? "in-progress" : "completed";
  }
  if (status === "blocked") {
    return hasRisk ? "blocked" : "in-progress";
  }
  return null;
}

function defaultPromptTemplate(_roleKey: string): AgentPromptTemplate {
  return {
    systemPrompt: `你是 BuildWise 的{{role}}，负责范围为{{scope}}。输出必须结构化、可执行、可追溯。`,
    userPrompt: "目标：{{goal}}\n上下文：{{context}}\n请严格输出：{{expectedOutput}}"
  };
}

function renderPromptTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => vars[key] ?? "");
}

function buildPrompt(
  input: Omit<IterationAgentPrompt, "systemPrompt" | "userPrompt" | "expectedOutput"> & {
    context: string;
    expectedOutput: string;
  }
): IterationAgentPrompt {
  const roleKey = String(input.role).toLowerCase();
  const template = loadAgentPromptTemplate(roleKey, defaultPromptTemplate(roleKey));
  return {
    agentId: input.agentId,
    role: input.role,
    scope: input.scope,
    goal: input.goal,
    systemPrompt: renderPromptTemplate(template.systemPrompt, {
      role: input.role,
      scope: input.scope,
      goal: input.goal,
      context: input.context,
      expectedOutput: input.expectedOutput
    }),
    userPrompt: renderPromptTemplate(template.userPrompt, {
      role: input.role,
      scope: input.scope,
      goal: input.goal,
      context: input.context,
      expectedOutput: input.expectedOutput
    }),
    expectedOutput: input.expectedOutput
  };
}

export function shouldUseCompactSingleFileAnalysis(params: {
  attachmentSignals?: {
    sourceType: "single-file" | "folder";
    hasPrototypeEvidence: boolean;
    hasDocumentEvidence: boolean;
    totalFiles: number;
  };
}) {
  return Boolean(
    params.attachmentSignals &&
      params.attachmentSignals.sourceType === "single-file" &&
      params.attachmentSignals.totalFiles <= 1 &&
      params.attachmentSignals.hasDocumentEvidence &&
      !params.attachmentSignals.hasPrototypeEvidence
  );
}

type AgentPlanParams = {
  iteration: Iteration;
  previous: Iteration | null;
  scope: AgentScope;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  risks: string[];
  fileName: string;
  attachmentMeta?: { strategy: string; digest: string; textPreview?: string };
  attachmentSignals?: { sourceType: "single-file" | "folder"; hasPrototypeEvidence: boolean; hasDocumentEvidence: boolean; totalFiles: number };
  knowledgeBaseSummary?: string;
};

function buildPlanDigests(params: AgentPlanParams) {
  const { iteration, diffLocations, attachmentMeta, attachmentSignals } = params;
  const diffDigest = formatDiffLocations(diffLocations.slice(0, 6));
  const boundary = iteration.changeControl?.boundary;
  const boundaryDigest =
    boundary && (boundary.requirementRefs.length > 0 || boundary.componentRefs.length > 0 || boundary.codePaths.length > 0)
      ? formatBoundaries(boundary.requirementRefs, boundary.componentRefs, boundary.codePaths)
      : "未指定变更边界";
  const confirmationDigest = iteration.changeControl?.pendingHumanConfirmation
    ? "待人工确认"
    : iteration.changeControl?.confirmedAt ? `已确认（${iteration.changeControl.confirmedAt}）` : "未确认";
  const attachmentDigest = attachmentMeta && (attachmentMeta.digest || attachmentMeta.strategy)
    ? `附件处理：${attachmentMeta.strategy || "直接解析"}；摘要：${attachmentMeta.digest || "无"}`
    : "附件处理：直接解析；摘要：无";
  const attachmentPreview = attachmentMeta?.textPreview?.trim()
    ? `附件预览：${attachmentMeta.textPreview.replace(/\s+/g, " ").slice(0, 240)}`
    : "附件预览：无";
  const attachmentSignalHint = attachmentSignals
    ? `输入信号：来源类型 ${attachmentSignals.sourceType === "single-file" ? "单文件" : "文件夹"}，${attachmentSignals.hasPrototypeEvidence ? "含" : "无"}原型，${attachmentSignals.hasDocumentEvidence ? "含" : "无"}文档，共 ${attachmentSignals.totalFiles} 个文件`
    : "";
  return { diffDigest, boundaryDigest, confirmationDigest, attachmentDigest, attachmentPreview, attachmentSignalHint };
}

function assemblePlanContext(params: AgentPlanParams, compact: boolean, digests: ReturnType<typeof buildPlanDigests>) {
  const { iteration, previous, risks } = params;
  const acceptanceDigest = iteration.scope.acceptanceCriteria.join("；") || "无";
  const acceptanceChecksDigest = iteration.changeControl?.executableConstraints?.acceptanceChecks.join("；") || "无";
  const requireInfoCompletion =
    Boolean(params.attachmentSignals) &&
    (params.attachmentSignals?.hasPrototypeEvidence || params.attachmentSignals?.hasDocumentEvidence || params.attachmentSignals?.sourceType === "folder");
  const infoCompletionHint = requireInfoCompletion ? "本轮必须先执行信息完善：融合文档与原型信息，补全缺失约束后再进入任务拆解。" : "";
  const ontologyHint = params.knowledgeBaseSummary ? `本体知识：${params.knowledgeBaseSummary.slice(0, 2000)}` : "";
  const contextBase = `项目迭代：${iteration.name}；当前状态：${iteration.status}；基线：${previous?.name ?? "无"}；${digests.diffDigest}；风险：${risks.join("；") || "无"}；验收标准：${acceptanceDigest}`;

  const contextParts = compact
    ? [
        "模式：单文件轻量分析", contextBase,
        `确认状态：${digests.confirmationDigest}`, `变更边界：${digests.boundaryDigest}`,
        digests.attachmentDigest, digests.attachmentPreview, digests.attachmentSignalHint,
        ontologyHint, "仅基于文本需求执行首轮闭环编排，避免展开与当前需求无关的原型/协作推断。"
      ]
    : [
        contextBase, `执行验收约束：${acceptanceChecksDigest}`,
        `确认状态：${digests.confirmationDigest}`, `变更边界：${digests.boundaryDigest}`,
        digests.attachmentDigest, digests.attachmentPreview, digests.attachmentSignalHint,
        infoCompletionHint, ontologyHint
      ];
  return contextParts.filter(Boolean).join("；");
}

export function buildIterationAgentPlan(params: AgentPlanParams): IterationAgentPlan {
  const { iteration, scope, risks, fileName, diffLocations } = params;
  const compact = shouldUseCompactSingleFileAnalysis({ attachmentSignals: params.attachmentSignals });
  const recommendedTransition = suggestNextTransition(iteration.status, risks, diffLocations.length);
  const objective = `基于附件 ${fileName} 驱动迭代 ${iteration.name} 全周期闭环执行`;
  const digests = buildPlanDigests(params);
  const contextWithControl = assemblePlanContext(params, compact, digests);
  const workflowTemplate = loadWorkflowTemplate({
    scope,
    fallback: { name: "default-single-agent", contextHint: "由项目管理Agent驱动阶段流转，专职Agent按职责完成交付。" }
  });
  const contextFinal = workflowTemplate.contextHint ? `${contextWithControl}；编排策略：${workflowTemplate.contextHint}` : contextWithControl;

  return {
    scope,
    objective,
    recommendedTransition,
    prompts: [
      buildPrompt(
        compact
          ? {
              agentId: "agent-requirements-analyst-compact-1", role: "requirements-analyst", scope,
              goal: "基于当前文本需求输出轻量结构化分析输入，供后续业务确认与治理合成复用",
              context: contextFinal,
              expectedOutput: "JSON: {infoCompletion:{required,missingInputs[],assumptions[]}, diff:{summary,added[],changed[],removed[]}, risks:[...], clarificationQuestions:[...]}"
            }
          : {
              agentId: "agent-project-manager-1", role: "orchestrator", scope,
              goal: "基于 skills 执行统一编排并输出可执行全周期计划",
              context: contextFinal,
              expectedOutput: "JSON: {summary, infoCompletion:{required,missingInputs[],assumptions[],completionActions[]}, stagePlan:[{stage,goal,entryCriteria,exitCriteria,owner,inBoundary:boolean}], blockers:[{id,reason,severity,evidence}], handoffPlan:[{fromRole,toRole,condition}], unknowns[], humanConfirmation:{required,questions[]}, nextAction}"
            }
      )
    ]
  };
}
