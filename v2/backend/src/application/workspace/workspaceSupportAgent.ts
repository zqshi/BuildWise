import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AgentScope, AttachmentAnalysisReport, Iteration, IterationAgentPlan, IterationAgentPrompt, IterationStatus } from "../../domain/workspace/types";

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

type AgentPromptTemplate = {
  systemPrompt: string;
  userPrompt: string;
};

function resolvePromptPath(roleKey: string) {
  const v2Path = resolve(process.cwd(), "prompts", `agent.${roleKey}.v2.md`);
  if (existsSync(v2Path)) {
    return v2Path;
  }
  return resolve(process.cwd(), "prompts", `agent.${roleKey}.v1.md`);
}

function parsePromptTemplate(content: string): AgentPromptTemplate | null {
  const systemMarker = "# system";
  const userMarker = "# user";
  const lower = content.toLowerCase();
  const systemStart = lower.indexOf(systemMarker);
  const userStart = lower.indexOf(userMarker);
  if (systemStart === -1 || userStart === -1 || userStart <= systemStart) {
    return null;
  }
  const systemPrompt = content.slice(systemStart + systemMarker.length, userStart).trim();
  const userPrompt = content.slice(userStart + userMarker.length).trim();
  if (!systemPrompt || !userPrompt) {
    return null;
  }
  return { systemPrompt, userPrompt };
}

function defaultPromptTemplate(roleKey: string): AgentPromptTemplate {
  return {
    systemPrompt: `你是 BuildWise 的{{role}}（role=${roleKey}），scope={{scope}}。输出必须结构化、可执行、可追溯。`,
    userPrompt: "目标：{{goal}}\n上下文：{{context}}\n请严格输出：{{expectedOutput}}"
  };
}

function loadAgentPromptTemplate(roleKey: string): AgentPromptTemplate {
  const filePath = resolvePromptPath(roleKey);
  if (!existsSync(filePath)) {
    return defaultPromptTemplate(roleKey);
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = parsePromptTemplate(raw);
    return parsed ?? defaultPromptTemplate(roleKey);
  } catch {
    return defaultPromptTemplate(roleKey);
  }
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
  const template = loadAgentPromptTemplate(roleKey);
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
  enforceSingleAgent?: boolean;
  forceMultiAgent?: boolean;
}): IterationAgentPlan {
  const { iteration, previous, scope, diffLocations, risks, fileName, attachmentMeta, enforceSingleAgent, forceMultiAgent } = params;
  const multiAgent = !enforceSingleAgent && (Boolean(forceMultiAgent) || diffLocations.length >= 2 || scope === "full-cycle");
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
  const contextBase = `项目迭代=${iteration.name}；当前状态=${iteration.status}；基线=${previous?.name ?? "无"}；差异=${diffDigest}；风险=${risks.join("；")}`;
  const contextWithControl = `${contextBase}；确认状态=${confirmationDigest}；变更边界=${boundaryDigest}；${attachmentDigest}；${attachmentPreview}`;

  const executionLoop = [
    "解析附件并固化范围差异",
    "输出待确认项并等待人工确认",
    "按确认后的边界重排任务清单与责任人",
    "执行开发与自测，记录阻塞",
    "触发评审与验收，决定是否流转状态"
  ];

  if (!multiAgent) {
    return {
      strategy: "single-agent",
      scope,
      objective,
      recommendedTransition,
      executionLoop,
      prompts: [
        buildPrompt({
          agentId: "agent-orchestrator-1",
          role: "orchestrator",
          scope,
          goal: "完成附件差异分析并输出可执行全周期计划",
          context: contextWithControl,
          expectedOutput:
            "JSON: {summary, stagePlan:[{stage,goal,entryCriteria,exitCriteria,inBoundary:boolean}], blockers:[{id,reason,severity,evidence}], unknowns[], humanConfirmation:{required,questions[]}, nextAction}"
        })
      ]
    };
  }

  return {
    strategy: "multi-agent",
    scope,
    objective,
    recommendedTransition,
    executionLoop,
    prompts: [
      buildPrompt({
        agentId: "agent-req-analyst-1",
        role: "requirements-analyst",
        scope,
        goal: "提取附件需求并定位与基线版本差异",
        context: contextWithControl,
        expectedOutput:
          "JSON: {diff:{added[],changed[],removed[]}, assumptions[], risks:[{item,level,evidence}], domainTerms:[{term,definition,evidence}], mappingHints:[{requirement,component,codePath,evidence}], unknowns[], clarificationQuestions[]}"
      }),
      buildPrompt({
        agentId: "agent-planner-1",
        role: "task-planner",
        scope,
        goal: "将差异转换为迭代任务、优先级和依赖",
        context: contextWithControl,
        expectedOutput:
          "JSON: {workPackages:[{id,title,owner,priority,dependsOn[],acceptanceCriteria[],inBoundary:boolean,evidence}], criticalPath[], outOfBoundaryWork[]}"
      }),
      buildPrompt({
        agentId: "agent-delivery-1",
        role: "delivery-engineer",
        scope,
        goal: "输出开发执行计划与回滚策略",
        context: contextWithControl,
        expectedOutput:
          "JSON: {implementationSteps:[{step,targets[],boundaryCheck,evidence}], codeChangePlan:[{path,changeType,reason,inBoundary:boolean}], rollbackPlan:[{trigger,action}], releaseGates[], stopConditions[]}"
      }),
      buildPrompt({
        agentId: "agent-qa-1",
        role: "qa-reviewer",
        scope,
        goal: "生成验收脚本并判定是否进入下一状态",
        context: contextWithControl,
        expectedOutput:
          "JSON: {testMatrix:[{type,caseId,focus,expected,evidence}], unitTests[], contractTests[], acceptanceChecklist[], regressionsToWatch[], releaseDecision:{pass:boolean,reason,blockers[]}, recommendedTransition, unknowns[]}"
      }),
      buildPrompt({
        agentId: "agent-boundary-guardian-1",
        role: "boundary-guardian",
        scope,
        goal: "输出变更边界白名单并标记越界项",
        context: contextWithControl,
        expectedOutput:
          "JSON: {boundary:{requirementRefs[],componentRefs[],codePaths[],note}, violations:[{item,reason,evidence}], confirmationChecklist[], unknowns[]}"
      }),
      buildPrompt({
        agentId: "agent-release-ops-1",
        role: "release-ops-advisor",
        scope,
        goal: "输出发布前运维归因与回滚建议",
        context: contextWithControl,
        expectedOutput:
          "JSON: {hypotheses:[{priority,item,evidence}], triageSteps:[{step,expectedSignal,fallback}], rollbackDecision:{shouldRollback,reason,trigger}, postmortemChecklist[], unknowns[]}"
      })
    ]
  };
}
