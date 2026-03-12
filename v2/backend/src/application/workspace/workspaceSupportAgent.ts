import type { AgentScope, AttachmentAnalysisReport, Iteration, IterationAgentPlan, IterationAgentPrompt, IterationStatus } from "../../domain/workspace/types";
import { loadAgentPromptTemplate, loadAgentScopeAdapterHint, loadDynamicWorkflowHint, loadWorkflowTemplate, type AgentPromptTemplate } from "./agentAssetRegistry";

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
  const hasRisk = risks.length > 0 && !risks.every((item) => item.includes("暂无显式风险"));
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

function defaultPromptTemplate(roleKey: string): AgentPromptTemplate {
  return {
    systemPrompt: `你是 BuildWise 的{{role}}（role=${roleKey}），scope={{scope}}。输出必须结构化、可执行、可追溯。`,
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

export function buildIterationAgentPlan(params: {
  iteration: Iteration;
  previous: Iteration | null;
  scope: AgentScope;
  diffLocations: AttachmentAnalysisReport["diffLocations"];
  risks: string[];
  fileName: string;
  attachmentMeta?: {
    strategy: string;
    digest: string;
    textPreview?: string;
  };
  attachmentSignals?: {
    sourceType: "single-file" | "folder";
    hasPrototypeEvidence: boolean;
    hasDocumentEvidence: boolean;
    totalFiles: number;
  };
}): IterationAgentPlan {
  const { iteration, previous, scope, diffLocations, risks, fileName, attachmentMeta, attachmentSignals } = params;
  const strategy: IterationAgentPlan["strategy"] = "single-agent";
  const recommendedTransition = suggestNextTransition(iteration.status, risks, diffLocations.length);
  const objective = `基于附件 ${fileName} 驱动迭代 ${iteration.name} 全周期闭环执行`;
  const diffDigest =
    diffLocations.length > 0
      ? diffLocations
          .slice(0, 6)
          .map((item) => `${item.dimension}:${item.changeType}:${item.currentItem}`)
          .join("；")
      : "无结构化差异";
  const boundary = iteration.changeControl?.boundary;
  const acceptanceDigest = iteration.scope.acceptanceCriteria.join("|") || "-";
  const acceptanceChecksDigest = iteration.changeControl?.executableConstraints?.acceptanceChecks.join("|") || "-";
  const boundaryDigest =
    boundary && (boundary.requirementRefs.length > 0 || boundary.componentRefs.length > 0 || boundary.codePaths.length > 0)
      ? `requirements=${boundary.requirementRefs.join("|") || "-"};components=${boundary.componentRefs.join("|") || "-"};codePaths=${boundary.codePaths.join("|") || "-"}`
      : "no-explicit-boundary";
  const confirmationDigest = iteration.changeControl?.pendingHumanConfirmation
    ? "pending-human-confirmation"
    : iteration.changeControl?.confirmedAt
      ? `confirmed@${iteration.changeControl.confirmedAt}`
      : "not-confirmed";
  const attachmentDigest =
    attachmentMeta && (attachmentMeta.digest || attachmentMeta.strategy)
      ? `附件处理=${attachmentMeta.strategy || "direct"}；digest=${attachmentMeta.digest || "n/a"}`
      : "附件处理=direct；digest=n/a";
  const attachmentPreview = attachmentMeta?.textPreview?.trim()
    ? `附件预览=${attachmentMeta.textPreview.replace(/\s+/g, " ").slice(0, 240)}`
    : "附件预览=无";
  const attachmentSignalHint = attachmentSignals
    ? `输入信号=sourceType:${attachmentSignals.sourceType};prototype:${attachmentSignals.hasPrototypeEvidence ? "yes" : "no"};documents:${attachmentSignals.hasDocumentEvidence ? "yes" : "no"};files:${attachmentSignals.totalFiles}`
    : "";
  const requireInfoCompletion =
    Boolean(attachmentSignals) &&
    (attachmentSignals!.hasPrototypeEvidence || attachmentSignals!.hasDocumentEvidence || attachmentSignals!.sourceType === "folder");
  const infoCompletionHint = requireInfoCompletion
    ? "本轮必须先执行信息完善：融合文档与原型信息，补全缺失约束后再进入任务拆解。"
    : "";
  const skillPackHint = "skillsRoot=v2/backend/skills/claude-arsenal/skills；运行策略=单编排Agent驱动技能链。";
  const dynamicWorkflowHint = loadDynamicWorkflowHint(scope);
  const agentScopeHint = loadAgentScopeAdapterHint();
  const contextBase = `项目迭代=${iteration.name}；当前状态=${iteration.status}；基线=${previous?.name ?? "无"}；差异=${diffDigest}；风险=${risks.join("；") || "无"}；验收标准=${acceptanceDigest}`;
  const contextWithControl = [
    contextBase,
    `执行验收约束=${acceptanceChecksDigest}`,
    `确认状态=${confirmationDigest}`,
    `变更边界=${boundaryDigest}`,
    attachmentDigest,
    attachmentPreview,
    attachmentSignalHint,
    infoCompletionHint,
    skillPackHint,
    dynamicWorkflowHint,
    agentScopeHint
  ]
    .filter(Boolean)
    .join("；");

  const workflowTemplate = loadWorkflowTemplate({
    scope,
    strategy,
    fallback: {
      name: "default-single-agent",
      strategy,
      executionLoop: [
        "信息完善：对齐文档/原型并补全缺失上下文",
        "解析附件并固化范围差异",
        "输出待确认项并等待人工确认",
        "按确认后的边界重排任务清单与责任人",
        "执行开发与自测，记录阻塞",
        "触发评审与验收，决定是否流转状态"
      ],
      contextHint: "由项目管理Agent驱动阶段流转，专职Agent按职责完成交付。"
    }
  });

  const contextFinal = workflowTemplate.contextHint ? `${contextWithControl}；workflowHint=${workflowTemplate.contextHint}` : contextWithControl;
  return {
    strategy,
    scope,
    objective,
    recommendedTransition,
    executionLoop: workflowTemplate.executionLoop,
    prompts: [
      buildPrompt({
        agentId: "agent-project-manager-1",
        role: "orchestrator",
        scope,
        goal: "基于 skills 执行统一编排并输出可执行全周期计划",
        context: contextFinal,
        expectedOutput:
          "JSON: {summary, infoCompletion:{required,missingInputs[],assumptions[],completionActions[]}, stagePlan:[{stage,goal,entryCriteria,exitCriteria,owner,inBoundary:boolean}], blockers:[{id,reason,severity,evidence}], handoffPlan:[{fromRole,toRole,condition}], unknowns[], humanConfirmation:{required,questions[]}, nextAction}"
      })
    ]
  };
}
