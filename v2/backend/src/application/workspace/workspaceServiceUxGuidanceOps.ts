import type { AgentRunner } from "./agentRunner";
import type { Iteration, AttachmentAnalysisReport } from "../../domain/workspace/types";
import { pickStringList, safeJsonParse } from "./workspaceServiceAttachmentUtils";

type UxArtifacts = {
  informationArchitecture: string[];
  interactionFlows: string[];
  uiStates: string[];
  uxConstraints: string[];
  updatedAt: string;
};

export async function generateUxExecutionGuidanceOp(params: {
  agentRunner: AgentRunner | null;
  iteration: Iteration | null;
  analysisReport: AttachmentAnalysisReport | null;
  rewriteInstruction: string;
}) {
  const warnings: string[] = [];
  const emptyArtifacts: UxArtifacts = {
    informationArchitecture: [],
    interactionFlows: [],
    uiStates: [],
    uxConstraints: [],
    updatedAt: ""
  };
  if (!params.agentRunner) {
    warnings.push("UX Agent 未配置，已跳过 UX 规格生成。");
    return { guidance: "", warnings, uxArtifacts: emptyArtifacts };
  }
  const iterationName = params.iteration?.name || "-";
  const boundary = params.iteration?.changeControl?.boundary;
  const context = [
    `iteration=${iterationName}`,
    `instruction=${params.rewriteInstruction}`,
    `boundary.codePaths=${boundary?.codePaths.join(" | ") || "-"}`,
    `mustDo=${params.analysisReport?.businessConfirmation?.necessityAssessment?.mustDo?.join(" | ") || "-"}`,
    `functionalPoints=${params.analysisReport?.businessConfirmation?.functionalPoints?.join(" | ") || "-"}`,
    `acceptance=${params.iteration?.scope?.acceptanceCriteria?.join(" | ") || "-"}`
  ].join("\n");
  try {
    const result = await params.agentRunner.run({
      agentId: "agent-ux-guidance-1",
      role: "ux-designer",
      scope: "iteration",
      goal: "输出可用于开发执行的 UX 约束与交互流程",
      expectedOutput: "JSON: {uxConstraints[],interactionFlows[],uiStates[],informationArchitecture[]}",
      systemPrompt: "你是 BuildWise 的 UX 设计Agent。仅输出 JSON，重点给出可执行 UX 约束。",
      userPrompt: `${context}\n请严格输出 JSON: {uxConstraints[],interactionFlows[],uiStates[],informationArchitecture[]}`
    });
    const parsed = safeJsonParse(result.content);
    if (!parsed) {
      warnings.push("UX Agent 输出解析失败，已跳过 UX 规格注入。");
      return { guidance: "", warnings, uxArtifacts: emptyArtifacts };
    }
    const uxConstraints = pickStringList(parsed.uxConstraints, 6);
    const flows = pickStringList(parsed.interactionFlows, 4);
    const states = pickStringList(parsed.uiStates, 4);
    const informationArchitecture = pickStringList(parsed.informationArchitecture, 6);
    const guidance = [...uxConstraints, ...flows, ...states].slice(0, 8).join("；");
    const hasUxArtifacts = uxConstraints.length > 0 || flows.length > 0 || states.length > 0 || informationArchitecture.length > 0;
    if (!guidance) {
      warnings.push("UX Agent 未返回有效约束，已跳过 UX 规格注入。");
    }
    return {
      guidance,
      warnings,
      uxArtifacts: hasUxArtifacts
        ? {
            informationArchitecture,
            interactionFlows: flows,
            uiStates: states,
            uxConstraints,
            updatedAt: new Date().toISOString()
          }
        : emptyArtifacts
    };
  } catch (error) {
    warnings.push(`UX Agent 调用失败，已跳过 UX 规格注入：${error instanceof Error ? error.message : "unknown"}`);
    return { guidance: "", warnings, uxArtifacts: emptyArtifacts };
  }
}
